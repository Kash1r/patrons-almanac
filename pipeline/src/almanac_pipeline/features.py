"""One row per finished Ranked or Unranked match, built from one day file. Phase 3's win-probability input.

A day file holds whole matches (measured on 7 days: no match appears in two day files), so a day's
features need only that day's file.
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

import duckdb

from almanac_pipeline import PipelineError

# The samples are at 180, 360, 540, 720 and 900 s, then every 300 s, then a last one at duration_s,
# so every minute below lands on a sample until the match ends.
SOUL_MINUTES = (3, 6, 9, 12, 15, 20, 25, 30, 35, 40)

_PLAYERS_PER_TEAM = 6
_TEAMS = (0, 1)
_THREADS = 4
_DAY_FILE = re.compile(r"match_player-(\d{4}-\d{2}-\d{2})\.parquet")


def _team_sum(per_player: str, team: int) -> str:
    """DuckDB sums a UINTEGER into a HUGEINT, which Parquet stores as DOUBLE (measured). BIGINT keeps integers."""
    return f"CAST(sum({per_player}) FILTER (WHERE team = 'Team{team}') AS BIGINT)"


def _souls_at(minute: int) -> str:
    """One player's net worth at the sample taken at that minute, NULL when the match ended earlier."""
    position = f'list_position("stats.time_stamp_s", {minute * 60})'
    return f'list_extract("stats.net_worth", NULLIF({position}, 0))'


# start_time, created_at, duration_s, match_mode, the badges and winning_team are the same on every
# row of a match (0 exceptions in the 154,272 Ranked and Unranked matches of 2026-10-17).
_COLUMNS: tuple[tuple[str, str], ...] = (
    ("match_id", "match_id"),
    ("start_time", "any_value(start_time)"),
    ("created_at", "any_value(created_at)"),
    ("duration_s", "any_value(duration_s)"),
    ("match_mode", "any_value(match_mode)"),
    ("average_badge_team0", "any_value(average_badge_team0)"),
    ("average_badge_team1", "any_value(average_badge_team1)"),
    ("team0_won", "any_value(winning_team) = 'Team0'"),
    *((f"team{t}_heroes", f"list(hero_id ORDER BY hero_id) FILTER (WHERE team = 'Team{t}')") for t in _TEAMS),
    *((f"team{t}_souls_final", _team_sum("net_worth", t)) for t in _TEAMS),
    *((f"team{t}_souls_{m:02d}m", _team_sum(_souls_at(m), t)) for m in SOUL_MINUTES for t in _TEAMS),
)

_SELECT = ", ".join(f"{expression} AS {name}" for name, expression in _COLUMNS)
_WHOLE_MATCH = " AND ".join(
    [f"count(*) = {len(_TEAMS) * _PLAYERS_PER_TEAM}"]
    + [f"count(*) FILTER (WHERE team = 'Team{t}') = {_PLAYERS_PER_TEAM}" for t in _TEAMS]
)
_QUERY = f"""
    SELECT {_SELECT}
    FROM read_parquet($day)
    WHERE match_mode IN ('Ranked', 'Unranked') AND match_outcome = 'TeamWin'
        AND winning_team IN ('Team0', 'Team1')
    GROUP BY match_id
    HAVING {_WHOLE_MATCH}
    ORDER BY match_id
"""


def feature_file_name(day_file: Path) -> str:
    """features-YYYY-MM-DD.parquet for match_player-YYYY-MM-DD.parquet, the same UTC ingestion day."""
    found = _DAY_FILE.fullmatch(day_file.name)
    if not found:
        raise PipelineError(f"{day_file.name} is not named match_player-YYYY-MM-DD.parquet")
    try:
        day = date.fromisoformat(found[1])
    except ValueError as e:
        raise PipelineError(f"{day_file.name} has no such date: {e}") from e
    return f"features-{day.isoformat()}.parquet"


def build(day_file: Path, out: Path) -> int:
    """Writes the features of one day file to out and returns the matches written.

    A match is kept only when all 12 of its rows are here, 6 per team, with a TeamWin outcome and a
    team as the winner. A day that keeps none still gets its file, with the full schema, so the nightly
    reconciliation counts it as built instead of retrying it every night.
    """
    out.parent.mkdir(parents=True, exist_ok=True)
    with duckdb.connect() as con:
        con.execute(f"SET threads = {_THREADS}")
        con.sql(_QUERY, params={"day": day_file.as_posix()}).write_parquet(out.as_posix(), compression="zstd")
        return con.execute("SELECT count(*) FROM read_parquet(?)", [out.as_posix()]).fetchone()[0]
