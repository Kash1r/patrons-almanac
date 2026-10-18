"""Turn the match_player dump into one Parquet file per UTC ingestion day.

The unit is the ingestion day: rows whose created_at (when deadlock-api stored them) falls on
one UTC calendar day. That is the only day upstream can declare finished. watermark_hi >= the
next midnight means no row of the day is still to come. So every day file is written once and
is final.

This module owns three decisions and nothing else repeats them:
  - where a day starts and ends (`_day_bounds`),
  - what a stored row is (`_COLUMNS`, `_KEEP`, newest copy per (match_id, player_slot)),
  - how far the release has got (`State.done_through`).

A run never talks to GitHub. It reads the prior state.json from a path and writes day files plus
the next state.json into an empty directory; the workflow uploads that directory.
"""

from __future__ import annotations

import json
import tempfile
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import duckdb

from almanac_pipeline import PipelineError
from almanac_pipeline.manifest import DumpFile, EpochSeconds, Snapshot, read_snapshot

FIRST_RUN_DAYS = 28
"""How much history a first run takes. 28 days is one remote pass of about 33 GB (measured)."""

STATE_FILE = "state.json"
_STATE_FORMAT = 1
_DAY = 86_400

# Never account_id: no player identities leave this module.
_COLUMNS: tuple[str, ...] = (
    "match_id",
    "player_slot",
    "created_at",
    "start_time",
    "duration_s",
    "game_mode",
    "match_mode",
    "average_badge_team0",
    "average_badge_team1",
    "winning_team",
    "match_outcome",
    "team",
    "hero_id",
    "kills",
    "deaths",
    "assists",
    "net_worth",
    "won",
    "stats.time_stamp_s",
    "stats.net_worth",
    "items.item_id",
    "items.game_time_s",
)
_SELECT = ", ".join(f'"{c}"' for c in _COLUMNS)
_KEEP = "game_mode = 'Normal'"
_NEWEST_PER_KEY = "QUALIFY row_number() OVER (PARTITION BY match_id, player_slot ORDER BY created_at DESC) = 1"


def _day_file_name(day: date) -> str:
    return f"match_player-{day.isoformat()}.parquet"


def _day_bounds(day: date) -> tuple[EpochSeconds, EpochSeconds]:
    """[start, end) of a UTC day. The planner's file choice and the SQL row filter both use this."""
    start = int(datetime(day.year, day.month, day.day, tzinfo=UTC).timestamp())
    return EpochSeconds(start), EpochSeconds(start + _DAY)


def _day_of(t: EpochSeconds) -> date:
    return datetime.fromtimestamp(t, tz=UTC).date()


@dataclass(frozen=True, slots=True)
class State:
    """The release's watermark, stored as state.json.

    Every UTC ingestion day <= done_through has its day file in the release. It never moves back.
    A date, not the manifest's timestamp, so a published day file is always a whole day.
    """

    done_through: date
    manifest_version: int
    """The manifest version the last run read. Informational, for the log."""

    @classmethod
    def load(cls, path: Path) -> State | None:
        """None when the file does not exist (first run). Unreadable or unknown format raises PipelineError."""
        if not path.exists():
            return None
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if raw["format"] != _STATE_FORMAT:
                raise PipelineError(f"{path}: state format is {raw['format']!r}, expected {_STATE_FORMAT}")
            return cls(date.fromisoformat(raw["done_through"]), int(raw["manifest_version"]))
        except (ValueError, KeyError, TypeError) as e:
            raise PipelineError(f"{path} is not a readable state file: {e!r}") from e

    def dump(self, path: Path) -> None:
        raw = {
            "format": _STATE_FORMAT,
            "done_through": self.done_through.isoformat(),
            "manifest_version": self.manifest_version,
        }
        path.write_text(json.dumps(raw) + "\n", encoding="utf-8", newline="\n")


Gap = tuple[EpochSeconds, EpochSeconds]


@dataclass(frozen=True, slots=True)
class Plan:
    """What one run does. Pure data, derived from (prior state, snapshot) by `plan`."""

    days: tuple[date, ...]
    """Contiguous, ascending, every one finished upstream. Empty when nothing new has finished."""
    files: tuple[DumpFile, ...]
    """Every dump file that can hold a row stored on one of `days`. Empty when `days` is."""
    gaps: tuple[Gap, ...]
    """Spans (after, up to] inside the planned days where rows may be in no file. Empty when `days` is."""
    state: State
    """state.json once these days are published. The prior state when `days` is empty."""


def plan(prior: State | None, snapshot: Snapshot) -> Plan:
    """Decide which days to write and which files to read. No I/O.

    last  = the UTC day before watermark_hi's day. Day D is finished iff watermark_hi >= end(D),
            so this is the newest finished day, also when watermark_hi sits exactly on a midnight.
    first = prior.done_through + 1, or last - (FIRST_RUN_DAYS - 1) on a first run.
    days  = first..last. Nothing is planned when last <= prior.done_through (a rerun on the same
            day, or a manifest older than the state), and the state is returned as it was.

    Files: (lo, hi] overlaps [start(first), end(last)), i.e. lo < end and hi >= start. Base parts
    (lo = 0) qualify whenever hi >= start. That is required, not an optimisation: rows already
    folded into a base part are gone from the increments (41% of 2026-10-17's rows lived only in
    base parts, measured). No special case for folds, missed nights or a first run follows from it.
    """
    last = _day_of(snapshot.watermark_hi) - timedelta(days=1)
    if prior is not None and last <= prior.done_through:
        return Plan(days=(), files=(), gaps=(), state=prior)
    first = prior.done_through + timedelta(days=1) if prior else last - timedelta(days=FIRST_RUN_DAYS - 1)
    days = tuple(first + timedelta(days=i) for i in range((last - first).days + 1))
    start, end = _day_bounds(first)[0], _day_bounds(last)[1]
    files = tuple(f for f in snapshot.files if f.lo < end and f.hi >= start)
    return Plan(days, files, _gaps(snapshot.files, start, end), State(last, snapshot.version))


def _gaps(files: Sequence[DumpFile], start: EpochSeconds, end: EpochSeconds) -> tuple[Gap, ...]:
    """Spans of [start, end) that no increment covers and a base part cannot make up for.

    A row is in a base part when created_at <= that part's hi, and in an increment when created_at
    is in its (lo, hi]. An uncovered span loses rows of any partition whose base part ends before
    the span does. When every base part reaches the span's end, nothing is missing.
    """
    increments = sorted((f for f in files if f.lo > 0 and f.lo < end and f.hi >= start), key=lambda f: f.lo)
    base_his = [f.hi for f in files if f.lo == 0]
    gaps: list[Gap] = []
    covered_to = start
    for f in increments:
        if covered_to < f.lo:
            gaps.append((covered_to, f.lo))
        covered_to = max(covered_to, f.hi)
    if covered_to < end:
        gaps.append((covered_to, end))
    return tuple(g for g in gaps if any(hi < g[1] for hi in base_his))


@dataclass(frozen=True, slots=True)
class Report:
    written: tuple[tuple[date, int], ...]
    """(day, rows) for each day file written, in day order."""
    state: State
    watermark_hi: EpochSeconds
    gaps: tuple[Gap, ...]


def run(manifest: str, state_path: Path, out_dir: Path) -> Report:
    """Write a day file for each newly finished day, then the next state.json, into out_dir.

    Idempotent: the output depends only on the prior state and upstream, so a rerun after a crash
    or a failed upload redoes the same days, and `--clobber` replaces what was half-published.
    When no day has finished since the last run, nothing is written.
    Raises PipelineError for bad input; DuckDB and network errors propagate. Either way the CLI
    exits non-zero and out_dir holds no state.json, so the workflow publishes nothing.
    """
    if out_dir.exists() and any(out_dir.iterdir()):
        raise PipelineError(f"{out_dir} is not empty")
    prior = State.load(state_path)
    snapshot = read_snapshot(manifest)
    the_plan = plan(prior, snapshot)
    written: tuple[tuple[date, int], ...] = ()
    if the_plan.days:
        out_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="almanac-") as tmp:
            stage = Path(tmp) / "stage"
            with _connect(Path(tmp) / "spill") as con:
                _stage(con, the_plan, stage)
                written = tuple(
                    (day, _write_day(con, stage, i, out_dir / _day_file_name(day)))
                    for i, day in enumerate(the_plan.days)
                )
        # Last: its presence means every day file in out_dir is complete.
        the_plan.state.dump(out_dir / STATE_FILE)
    return Report(written, the_plan.state, snapshot.watermark_hi, the_plan.gaps)


def latest_rows(con: duckdb.DuckDBPyConnection, day_files: Sequence[str]) -> duckdb.DuckDBPyRelation:
    """Rows from several day files, one per (match_id, player_slot): the copy with the newest created_at.

    The read side of the day-file contract. A match deadlock-api stored again on a later day sits in
    both days' files; this is where that is resolved. Paths may be local or release URLs.
    """
    # Inlined, not bound as a parameter: a bound relation runs the window over every column before a
    # later .filter() or .project() applies (113 s against 0.1 s on one day file, measured).
    files = ", ".join("'" + f.replace("'", "''") + "'" for f in day_files)
    return con.sql(f"SELECT * FROM read_parquet([{files}]) {_NEWEST_PER_KEY}")


def _connect(spill: Path) -> duckdb.DuckDBPyConnection:
    """In-memory DuckDB tuned for a large streaming COPY on a 16 GB runner.

    preserve_insertion_order = false lets the partitioned COPY stream instead of buffering.
    Spilling goes under the run's own temp directory, not the working directory.
    No timestamps are ever fetched into Python: DuckDB needs pytz for that (measured), so all
    time arithmetic stays in epoch seconds.
    """
    return duckdb.connect(config={"preserve_insertion_order": False, "temp_directory": spill.as_posix()})


def _stage(con: duckdb.DuckDBPyConnection, the_plan: Plan, stage: Path) -> None:
    """One remote pass for all planned days: kept rows, partitioned by day index, to local disk.

    One pass, not one per day. Base row groups span weeks of created_at, so per-day reads re-fetch
    them: a 28-day backfill reads 516 GB per day vs 32.8 GB in one pass (measured from footers).
    Duplicates are left in; `_write_day` removes them. day_index i is days[i]: the same
    86,400-second stride as _day_bounds, so there is no second definition of a UTC day.
    """
    start = _day_bounds(the_plan.days[0])[0]
    end = _day_bounds(the_plan.days[-1])[1]
    con.sql(
        f"""
        SELECT {_SELECT}, CAST(floor((epoch(created_at) - $start) / $day) AS INTEGER) AS day_index
        FROM read_parquet($files)
        WHERE created_at >= to_timestamp($start) AND created_at < to_timestamp($end) AND {_KEEP}
        """,
        params={"files": [f.url for f in the_plan.files], "start": start, "end": end, "day": _DAY},
    ).write_parquet(stage.as_posix(), partition_by=["day_index"], compression="zstd")
    if not any(stage.rglob("*.parquet")):
        raise PipelineError(f"upstream finished {the_plan.days[0]} to {the_plan.days[-1]} without one Normal row")


def _write_day(con: duckdb.DuckDBPyConnection, stage: Path, day_index: int, out: Path) -> int:
    """Write one day file from the stage and return its row count.

    Newest copy wins because a base part and a not-yet-rolled-up delta both hold recent rows, and
    a key stored twice in one day differs in created_at (192 of 114,297 keys in partition 116, measured).
    A day with no rows still gets a file with the full schema.
    """
    con.sql(
        f"""
        SELECT {_SELECT} FROM read_parquet($stage, hive_partitioning = true)
        WHERE day_index = $i {_NEWEST_PER_KEY}
        ORDER BY match_id, player_slot
        """,
        params={"stage": f"{stage.as_posix()}/**/*.parquet", "i": day_index},
    ).write_parquet(out.as_posix(), compression="zstd")
    return con.execute("SELECT count(*) FROM read_parquet(?)", [out.as_posix()]).fetchone()[0]
