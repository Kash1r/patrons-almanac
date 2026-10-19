from pathlib import Path

import duckdb
import pytest
from fake_dump import DumpRow, roster, ts, write_dump_file

from almanac_pipeline import PipelineError
from almanac_pipeline.features import build, feature_file_name

DAY = "match_player-2026-10-17.parquet"


def build_day(tmp_path: Path, *matches: tuple[DumpRow, ...]) -> tuple[int, Path]:
    day_file = tmp_path / DAY
    write_dump_file(day_file, tuple(row for match in matches for row in match))
    out = tmp_path / "out" / "features-2026-10-17.parquet"
    return build(day_file, out), out


def read_matches(path: Path) -> list[dict]:
    """Timestamps come back as epoch seconds: DuckDB needs pytz to hand a TIMESTAMPTZ to Python."""
    cursor = duckdb.connect().execute(
        "SELECT * REPLACE (epoch(start_time) AS start_time, epoch(created_at) AS created_at) FROM read_parquet(?)",
        [str(path)],
    )
    names = [column[0] for column in cursor.description]
    return [dict(zip(names, row, strict=True)) for row in cursor.fetchall()]


NO_SAMPLE = {f"team{t}_souls_{m:02d}m": None for t in (0, 1) for m in (9, 12, 15, 20, 25, 30, 35, 40)}


def test_a_full_match_becomes_one_row_with_sorted_heroes_and_each_teams_summed_souls(tmp_path):
    match = roster(
        100,
        team0_heroes=(6, 2, 9, 4, 1, 7),
        team1_heroes=(15, 11, 13, 12, 16, 14),
        time_stamp_s=(180, 360),
        duration_s=360,
        match_mode="Ranked",
        average_badge_team0=63,
        average_badge_team1=71,
    )
    matches, out = build_day(tmp_path, match)
    assert matches == 1
    assert read_matches(out) == [
        {
            "match_id": 100,
            "start_time": ts("2026-10-17 11:00"),
            "created_at": ts("2026-10-17 12:00"),
            "duration_s": 360,
            "match_mode": "Ranked",
            "average_badge_team0": 63,
            "average_badge_team1": 71,
            "team0_won": True,
            "team0_heroes": [1, 2, 4, 6, 7, 9],
            "team1_heroes": [11, 12, 13, 14, 15, 16],
            "team0_souls_final": 25500,
            "team1_souls_final": 22500,
            "team0_souls_03m": 7500,
            "team1_souls_03m": 6900,
            "team0_souls_06m": 16500,
            "team1_souls_06m": 13500,
        }
        | NO_SAMPLE
    ]


def test_team0_won_follows_the_winning_team(tmp_path):
    _, out = build_day(
        tmp_path,
        roster(300, match_mode="Ranked", winning_team="Team0"),
        roster(7, match_mode="Unranked", winning_team="Team1"),
    )
    assert [(m["match_id"], m["match_mode"], m["team0_won"]) for m in read_matches(out)] == [
        (7, "Unranked", False),
        (300, "Ranked", True),
    ]


def test_matches_come_out_sorted_by_match_id_however_the_day_file_is_ordered(tmp_path):
    seed = tmp_path / "seed.parquet"
    write_dump_file(seed, roster(0))
    day_file = tmp_path / DAY
    duckdb.connect().execute(
        "COPY (SELECT * REPLACE (m::UBIGINT AS match_id) FROM read_parquet(?), range(1, 5001) AS r(m)"
        f" ORDER BY hash(m)) TO '{day_file.as_posix()}' (FORMAT parquet)",
        [str(seed)],
    )
    out = tmp_path / "out" / "features-2026-10-17.parquet"
    assert build(day_file, out) == 5000
    assert [m["match_id"] for m in read_matches(out)] == list(range(1, 5001))


def test_a_match_that_ended_between_samples_has_no_souls_from_the_next_minute_on(tmp_path):
    ended_at_500_s = roster(
        5, time_stamp_s=(180, 360, 500), team0_souls=(1000, 2500, 3000), team1_souls=(900, 2000, 2200)
    )
    _, out = build_day(tmp_path, ended_at_500_s)
    [row] = read_matches(out)
    assert {k: v for k, v in row.items() if "_souls_" in k and not k.endswith("final")} == {
        "team0_souls_03m": 7500,
        "team1_souls_03m": 6900,
        "team0_souls_06m": 16500,
        "team1_souls_06m": 13500,
    } | NO_SAMPLE


def test_a_missing_badge_stays_null_and_the_match_is_kept(tmp_path):
    matches, out = build_day(tmp_path, roster(5, average_badge_team0=None, average_badge_team1=71))
    assert matches == 1
    [row] = read_matches(out)
    assert (row["average_badge_team0"], row["average_badge_team1"]) == (None, 71)


EXCLUDED = {
    "11 rows": roster(2)[:-1],
    "7 players against 5": roster(2, team0_heroes=(1, 2, 3, 4, 5, 6, 7), team1_heroes=(11, 12, 13, 14, 15)),
    "CoopBot": roster(2, match_mode="CoopBot"),
    "PrivateLobby": roster(2, match_mode="PrivateLobby"),
    "Spectator winner": roster(2, winning_team="Spectator"),
    "not a TeamWin": roster(2, match_outcome="Error"),
}


@pytest.mark.parametrize("rows", EXCLUDED.values(), ids=EXCLUDED.keys())
def test_a_match_that_is_not_a_full_ranked_or_unranked_team_win_is_left_out(tmp_path, rows):
    matches, out = build_day(tmp_path, roster(1, match_mode="Unranked"), rows)
    assert matches == 1
    assert [m["match_id"] for m in read_matches(out)] == [1]


def test_the_schema_is_exactly_the_documented_columns_in_order(tmp_path):
    _, out = build_day(tmp_path, roster(1))
    described = duckdb.connect().execute("DESCRIBE SELECT * FROM read_parquet(?)", [str(out)]).fetchall()
    assert [(name, kind) for name, kind, *_ in described] == [
        ("match_id", "UBIGINT"),
        ("start_time", "TIMESTAMP WITH TIME ZONE"),
        ("created_at", "TIMESTAMP WITH TIME ZONE"),
        ("duration_s", "UINTEGER"),
        ("match_mode", "VARCHAR"),
        ("average_badge_team0", "UINTEGER"),
        ("average_badge_team1", "UINTEGER"),
        ("team0_won", "BOOLEAN"),
        ("team0_heroes", "UTINYINT[]"),
        ("team1_heroes", "UTINYINT[]"),
        ("team0_souls_final", "BIGINT"),
        ("team1_souls_final", "BIGINT"),
        ("team0_souls_03m", "BIGINT"),
        ("team1_souls_03m", "BIGINT"),
        ("team0_souls_06m", "BIGINT"),
        ("team1_souls_06m", "BIGINT"),
        ("team0_souls_09m", "BIGINT"),
        ("team1_souls_09m", "BIGINT"),
        ("team0_souls_12m", "BIGINT"),
        ("team1_souls_12m", "BIGINT"),
        ("team0_souls_15m", "BIGINT"),
        ("team1_souls_15m", "BIGINT"),
        ("team0_souls_20m", "BIGINT"),
        ("team1_souls_20m", "BIGINT"),
        ("team0_souls_25m", "BIGINT"),
        ("team1_souls_25m", "BIGINT"),
        ("team0_souls_30m", "BIGINT"),
        ("team1_souls_30m", "BIGINT"),
        ("team0_souls_35m", "BIGINT"),
        ("team1_souls_35m", "BIGINT"),
        ("team0_souls_40m", "BIGINT"),
        ("team1_souls_40m", "BIGINT"),
    ]


def test_a_day_without_a_qualifying_match_still_gets_an_empty_file_with_the_schema(tmp_path):
    matches, out = build_day(tmp_path, roster(2, match_mode="CoopBot"))
    assert matches == 0
    assert read_matches(out) == []
    assert len(duckdb.sql(f"DESCRIBE SELECT * FROM '{out.as_posix()}'").fetchall()) == 32


def test_the_feature_file_is_named_after_the_day_file(tmp_path):
    assert feature_file_name(tmp_path / DAY) == "features-2026-10-17.parquet"


@pytest.mark.parametrize(
    "name",
    ["features-2026-10-17.parquet", "match_player-2026-10-17.csv", "match_player-2026-13-45.parquet", "day.parquet"],
)
def test_a_name_that_is_not_a_day_file_is_rejected(tmp_path, name):
    with pytest.raises(PipelineError, match=name):
        feature_file_name(tmp_path / name)
