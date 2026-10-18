from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import duckdb


def ts(utc: str) -> int:
    return int(datetime.fromisoformat(utc).replace(tzinfo=UTC).timestamp())


@dataclass(frozen=True)
class DumpRow:
    match_id: int
    player_slot: int
    created_at: str
    game_mode: str = "Normal"
    match_mode: str = "Unranked"
    kills: int = 1
    account_id: int = 256939921


@dataclass(frozen=True)
class FixtureFile:
    name: str
    kind: str
    hi: str
    lo: str | None = None
    rows: tuple[DumpRow, ...] = ()


_SCHEMA = """
    match_id UBIGINT, player_slot UINTEGER, account_id UINTEGER, created_at TIMESTAMPTZ,
    start_time TIMESTAMPTZ, duration_s UINTEGER, game_mode VARCHAR, match_mode VARCHAR,
    average_badge_team0 UINTEGER, average_badge_team1 UINTEGER,
    winning_team VARCHAR, match_outcome VARCHAR, team VARCHAR,
    hero_id UTINYINT, kills UINTEGER, deaths UINTEGER, assists UINTEGER, net_worth UINTEGER,
    won BOOLEAN, last_hits UINTEGER,
    "stats.time_stamp_s" UINTEGER[], "stats.net_worth" UINTEGER[],
    "items.item_id" UINTEGER[], "items.game_time_s" UINTEGER[]
"""

_FIXED_VALUES = """
    1800 AS duration_s, 85 AS average_badge_team0, 85 AS average_badge_team1,
    'Team0' AS winning_team, 'TeamWin' AS match_outcome, 'Team0' AS team,
    7 AS hero_id, 2 AS deaths, 3 AS assists, 30000 AS net_worth, true AS won, 50 AS last_hits,
    [180, 300] AS "stats.time_stamp_s", [1000, 2000] AS "stats.net_worth",
    [1001] AS "items.item_id", [60] AS "items.game_time_s"
"""


def write_dump_file(path: Path, rows: tuple[DumpRow, ...]) -> None:
    """account_id and last_hits are here so tests can prove the ingest drops them."""
    con = duckdb.connect()
    con.execute(f"CREATE TABLE t ({_SCHEMA})")
    for r in rows:
        con.execute(
            "INSERT INTO t BY NAME SELECT ? AS match_id, ? AS player_slot, ? AS account_id,"
            " to_timestamp(?) AS created_at, to_timestamp(?) - INTERVAL 1 HOUR AS start_time,"
            f" ? AS game_mode, ? AS match_mode, ? AS kills, {_FIXED_VALUES}",
            [
                r.match_id,
                r.player_slot,
                r.account_id,
                ts(r.created_at),
                ts(r.created_at),
                r.game_mode,
                r.match_mode,
                r.kills,
            ],
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY t TO '{path.as_posix()}' (FORMAT parquet)")


def write_dump(root: Path, files: list[FixtureFile], watermark_hi: str, version: int = 1) -> str:
    entries = []
    for f in files:
        key = f"v1/tables/match_player/g2/{f.kind}/{f.name}.parquet"
        write_dump_file(root / key, f.rows)
        entry = {"key": key, "kind": f.kind, "generation": 2, "hi": ts(f.hi), "rows": len(f.rows)}
        if f.lo is not None:
            entry["lo"] = ts(f.lo)
        entries.append(entry)
    manifest = {
        "format_version": 1,
        "version": version,
        "public_url": root.as_posix(),
        "tables": {
            "match_player": {
                "policy": "incremental",
                "watermark": "created_at",
                "watermark_hi": ts(watermark_hi),
                "files": entries,
            }
        },
    }
    path = root / "manifest.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    return str(path)


def read_rows(path: Path, *columns: str) -> list[tuple]:
    """Select timestamps as epoch(created_at): DuckDB needs pytz to hand a TIMESTAMPTZ to Python."""
    return duckdb.connect().execute(f"SELECT {', '.join(columns)} FROM read_parquet(?)", [str(path)]).fetchall()


def two_day_dump(root: Path) -> str:
    """Shaped like the live dump on 2026-10-18 at 03:53 UTC, covering the 16th and 17th.

    Base part 116 was refolded after the residual was built, so row 1 lives only in the base part.
    Row 2 sits in both a base part and a delta. Row 6 was stored twice on the 17th. Row 10 was
    stored on the 16th and again on the 17th. Row 12 was stored at exactly 00:00 on the 17th, and
    row 7 at exactly 00:00 on the 18th, a day that has not finished.
    """
    r = DumpRow
    return write_dump(
        root / "dump",
        [
            FixtureFile(
                "residual-1",
                "residual",
                lo="2026-10-16 15:15",
                hi="2026-10-17 11:57",
                rows=(
                    r(3, 0, "2026-10-16 20:00"),
                    r(5, 0, "2026-10-17 09:00"),
                    r(10, 0, "2026-10-16 16:00", kills=1),
                    r(9, 0, "2026-10-17 10:00", match_mode="PrivateLobby"),
                ),
            ),
            FixtureFile(
                "delta-1",
                "delta",
                lo="2026-10-17 11:57",
                hi="2026-10-17 12:57",
                rows=(
                    r(2, 0, "2026-10-17 12:00", kills=5),
                    r(6, 0, "2026-10-17 12:30", kills=1),
                    r(10, 0, "2026-10-17 12:10", kills=2),
                ),
            ),
            FixtureFile(
                "delta-2", "delta", lo="2026-10-17 12:57", hi="2026-10-18 00:53", rows=(r(7, 0, "2026-10-18 00:00"),)
            ),
            FixtureFile(
                "part-116",
                "base",
                hi="2026-10-18 01:13",
                rows=(
                    r(1, 0, "2026-10-17 05:00"),
                    r(2, 0, "2026-10-17 12:00", kills=5),
                    r(4, 0, "2026-10-17 07:00", game_mode="StreetBrawl"),
                    r(6, 0, "2026-10-17 23:00", kills=9),
                    r(8, 0, "2026-10-17 23:59:59"),
                    r(12, 0, "2026-10-17 00:00"),
                ),
            ),
            FixtureFile("part-11", "base", hi="2026-10-16 10:00", rows=(r(11, 0, "2026-10-16 09:00"),)),
        ],
        watermark_hi="2026-10-18 03:53",
    )


def seed_state(root: Path, done_through: str) -> Path:
    path = root / "in" / "state.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"format": 1, "done_through": done_through, "manifest_version": 0}), encoding="utf-8")
    return path
