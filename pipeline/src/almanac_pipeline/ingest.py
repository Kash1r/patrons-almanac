"""One Parquet file per UTC ingestion day: the rows whose created_at (when deadlock-api stored them)
falls on that day. It is the only day upstream can declare finished (watermark_hi >= the next
midnight), so a day file is written once and is final.
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

# A deep backfill does not belong in the nightly. Base row groups span weeks of created_at, so each
# one-day pass re-reads them (28 one-day passes read 516 GB against about 33 GB for one pass, from
# file footers).
FIRST_RUN_DAYS = 1
MAX_DAYS_PER_RUN = 7

# The remote read waits on request latency. On the 4-core, 16 GB runner, staging one day took 37 s at
# 256 threads, 176 s at 64, and over 10 min at DuckDB's default of 4. Multi-day passes at 128 threads
# or more starved the runner (RSS near 15 GB). These settings are the ones measured for a 7-day
# catch-up with a fresh connection per day: 839 s, 10.9 GB peak.
_REMOTE_THREADS = 64
_LOCAL_THREADS = 4
_STAGE_ROW_GROUP_SIZE = 8192

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
    """[start, end) of a UTC day."""
    start = int(datetime(day.year, day.month, day.day, tzinfo=UTC).timestamp())
    return EpochSeconds(start), EpochSeconds(start + _DAY)


def _day_of(t: EpochSeconds) -> date:
    return datetime.fromtimestamp(t, tz=UTC).date()


@dataclass(frozen=True, slots=True)
class State:
    """Every UTC ingestion day <= done_through has its day file in the release, and it never moves back.

    A date, not the manifest's timestamp, so a published day file is always a whole day.
    """

    done_through: date
    manifest_version: int

    @classmethod
    def load(cls, path: Path) -> State | None:
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
    days: tuple[date, ...]
    """Contiguous and ascending."""
    files: tuple[DumpFile, ...]
    gaps: tuple[Gap, ...]
    """Spans (after, up to] where rows may be in no file."""
    state: State


def plan(prior: State | None, snapshot: Snapshot) -> Plan:
    """Day D is finished iff watermark_hi >= end(D), so the last finished day is the one before
    watermark_hi's day, midnight included. A run plans at most MAX_DAYS_PER_RUN days, oldest first,
    and a longer backlog takes several runs.

    Base parts (lo = 0) are read whenever hi >= start. That is required, not an optimisation: rows
    folded into a base part are gone from the increments (41% of 2026-10-17's rows lived only in
    base parts, measured).
    """
    last = _day_of(snapshot.watermark_hi) - timedelta(days=1)
    if prior is not None and last <= prior.done_through:
        return Plan(days=(), files=(), gaps=(), state=prior)
    first = prior.done_through + timedelta(days=1) if prior else last - timedelta(days=FIRST_RUN_DAYS - 1)
    last = min(last, first + timedelta(days=MAX_DAYS_PER_RUN - 1))
    days = tuple(first + timedelta(days=i) for i in range((last - first).days + 1))
    start, end = _day_bounds(first)[0], _day_bounds(last)[1]
    files = _overlapping(snapshot.files, start, end)
    return Plan(days, files, _gaps(snapshot.files, start, end), State(last, snapshot.version))


def _overlapping(files: Sequence[DumpFile], start: EpochSeconds, end: EpochSeconds) -> tuple[DumpFile, ...]:
    return tuple(f for f in files if f.lo < end and f.hi >= start)


def _gaps(files: Sequence[DumpFile], start: EpochSeconds, end: EpochSeconds) -> tuple[Gap, ...]:
    """Spans no increment covers, where some base part ends before the span does.

    A base part holds every row up to its hi, so a span it reaches loses nothing.
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
    state: State
    watermark_hi: EpochSeconds
    gaps: tuple[Gap, ...]


def run(manifest: str, state_path: Path, out_dir: Path) -> Report:
    """Idempotent: the output depends only on the prior state and upstream, so a rerun after a crash
    or a failed upload redoes the same days.
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
            written = tuple(
                (day, _ingest_day(the_plan.files, day, Path(tmp), out_dir / _day_file_name(day)))
                for day in the_plan.days
            )
        if not any(rows for _, rows in written):
            days = ", ".join(day.isoformat() for day in the_plan.days)
            raise PipelineError(f"upstream finished {days} without one Normal row")
        # Last: its presence means every day file in out_dir is complete.
        the_plan.state.dump(out_dir / STATE_FILE)
    return Report(written, the_plan.state, snapshot.watermark_hi, the_plan.gaps)


def latest_rows(con: duckdb.DuckDBPyConnection, day_files: Sequence[str]) -> duckdb.DuckDBPyRelation:
    """Rows from several day files, one per (match_id, player_slot): the newest created_at wins.

    A match deadlock-api stored again on a later day sits in both days' files; this resolves it.
    """
    # Inlined, not bound: a bound parameter runs the window over every column before a later
    # .filter() or .project() applies (113 s against 0.1 s on one day file, measured).
    files = ", ".join("'" + f.replace("'", "''") + "'" for f in day_files)
    return con.sql(f"SELECT * FROM read_parquet([{files}]) {_NEWEST_PER_KEY}")


def _connect(spill: Path) -> duckdb.DuckDBPyConnection:
    """preserve_insertion_order = false lets the stage write stream instead of buffering to keep row order.

    Never fetch timestamps into Python: DuckDB needs pytz for that (measured), so time arithmetic
    stays in epoch seconds.
    """
    return duckdb.connect(config={"preserve_insertion_order": False, "temp_directory": spill.as_posix()})


def _ingest_day(files: Sequence[DumpFile], day: date, tmp: Path, out: Path) -> int:
    """The connection is fresh per day: one shared across 7 days peaked at 14.4 GB RSS against 10.9 GB.

    Newest copy wins: a base part and a not-yet-rolled-up delta both hold recent rows, and a key
    stored twice in one day differs in created_at (192 of 114,297 keys in partition 116, measured).
    """
    start, end = _day_bounds(day)
    stage = tmp / f"stage-{day.isoformat()}.parquet"
    with _connect(tmp / "spill") as con:
        con.execute(f"SET threads = {_REMOTE_THREADS}")
        con.sql(
            f"""
            SELECT {_SELECT} FROM read_parquet($files)
            WHERE created_at >= to_timestamp($start) AND created_at < to_timestamp($end) AND {_KEEP}
            """,
            params={"files": [f.url for f in _overlapping(files, start, end)], "start": start, "end": end},
        ).write_parquet(stage.as_posix(), compression="zstd", row_group_size=_STAGE_ROW_GROUP_SIZE)
        con.execute(f"SET threads = {_LOCAL_THREADS}")
        con.sql(
            f"SELECT {_SELECT} FROM read_parquet($stage) {_NEWEST_PER_KEY} ORDER BY match_id, player_slot",
            params={"stage": stage.as_posix()},
        ).write_parquet(out.as_posix(), compression="zstd")
        stage.unlink()
        return con.execute("SELECT count(*) FROM read_parquet(?)", [out.as_posix()]).fetchone()[0]
