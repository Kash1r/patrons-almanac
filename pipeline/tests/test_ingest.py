"""End to end over a fake dump on local disk: the same code path as production, minus the network."""

import json
from datetime import date

import duckdb
import pytest
from fake_dump import DumpRow, FixtureFile, read_rows, seed_state, ts, two_day_dump, write_dump

from almanac_pipeline import PipelineError
from almanac_pipeline.ingest import latest_rows, run

DAY_17 = "match_player-2026-10-17.parquet"


def test_nightly_run_writes_the_finished_day_then_the_state(tmp_path):
    out = tmp_path / "out"
    report = run(two_day_dump(tmp_path), seed_state(tmp_path, "2026-10-16"), out)
    assert report.written == ((date(2026, 10, 17), 8),)
    assert report.gaps == ()
    assert sorted(p.name for p in out.iterdir()) == [DAY_17, "state.json"]
    assert json.loads((out / "state.json").read_text(encoding="utf-8")) == {
        "format": 1,
        "done_through": "2026-10-17",
        "manifest_version": 1,
    }


def test_a_day_file_holds_the_newest_normal_copy_of_every_row_stored_that_day(tmp_path):
    out = tmp_path / "out"
    run(two_day_dump(tmp_path), seed_state(tmp_path, "2026-10-16"), out)
    assert read_rows(out / DAY_17, "match_id", "kills", "match_mode") == [
        (1, 1, "Unranked"),
        (2, 5, "Unranked"),
        (5, 1, "Unranked"),
        (6, 9, "Unranked"),
        (8, 1, "Unranked"),
        (9, 1, "PrivateLobby"),
        (10, 2, "Unranked"),
        (12, 1, "Unranked"),
    ]


def test_a_day_file_keeps_exactly_the_22_listed_columns_and_never_account_id(tmp_path):
    out = tmp_path / "out"
    run(two_day_dump(tmp_path), seed_state(tmp_path, "2026-10-16"), out)
    described = duckdb.connect().execute("DESCRIBE SELECT * FROM read_parquet(?)", [str(out / DAY_17)]).fetchall()
    assert [(name, kind) for name, kind, *_ in described] == [
        ("match_id", "UBIGINT"),
        ("player_slot", "UINTEGER"),
        ("created_at", "TIMESTAMP WITH TIME ZONE"),
        ("start_time", "TIMESTAMP WITH TIME ZONE"),
        ("duration_s", "UINTEGER"),
        ("game_mode", "VARCHAR"),
        ("match_mode", "VARCHAR"),
        ("average_badge_team0", "UINTEGER"),
        ("average_badge_team1", "UINTEGER"),
        ("winning_team", "VARCHAR"),
        ("match_outcome", "VARCHAR"),
        ("team", "VARCHAR"),
        ("hero_id", "UTINYINT"),
        ("kills", "UINTEGER"),
        ("deaths", "UINTEGER"),
        ("assists", "UINTEGER"),
        ("net_worth", "UINTEGER"),
        ("won", "BOOLEAN"),
        ("stats.time_stamp_s", "UINTEGER[]"),
        ("stats.net_worth", "UINTEGER[]"),
        ("items.item_id", "UINTEGER[]"),
        ("items.game_time_s", "UINTEGER[]"),
    ]


def test_catching_up_writes_every_missed_day_and_an_empty_day_still_gets_a_file(tmp_path):
    out = tmp_path / "out"
    report = run(two_day_dump(tmp_path), seed_state(tmp_path, "2026-10-14"), out)
    assert report.written == ((date(2026, 10, 15), 0), (date(2026, 10, 16), 3), (date(2026, 10, 17), 8))
    assert read_rows(out / "match_player-2026-10-16.parquet", "match_id", "kills") == [(3, 1), (10, 1), (11, 1)]


def test_a_catch_up_that_starts_before_the_oldest_increment_reports_the_uncovered_span(tmp_path):
    report = run(two_day_dump(tmp_path), seed_state(tmp_path, "2026-10-14"), tmp_path / "out")
    assert report.gaps == ((ts("2026-10-15 00:00"), ts("2026-10-16 15:15")),)


def test_first_run_without_a_state_file_backfills_28_days(tmp_path):
    report = run(two_day_dump(tmp_path), tmp_path / "in" / "state.json", tmp_path / "out")
    assert [day for day, _ in report.written][::27] == [date(2026, 9, 20), date(2026, 10, 17)]
    assert len(report.written) == 28


def test_rerun_on_the_same_day_writes_nothing_so_the_state_is_never_rewritten(tmp_path):
    out = tmp_path / "out"
    report = run(two_day_dump(tmp_path), seed_state(tmp_path, "2026-10-17"), out)
    assert report.written == ()
    assert report.state.done_through == date(2026, 10, 17)
    assert list(out.glob("*")) == []


def test_rerun_after_a_crash_rewrites_identical_day_files(tmp_path):
    manifest, state = two_day_dump(tmp_path), seed_state(tmp_path, "2026-10-15")
    run(manifest, state, tmp_path / "first")
    run(manifest, state, tmp_path / "second")
    for name in ("match_player-2026-10-16.parquet", DAY_17):
        assert read_rows(
            tmp_path / "first" / name, "match_id", "player_slot", "epoch(created_at)", "kills"
        ) == read_rows(tmp_path / "second" / name, "match_id", "player_slot", "epoch(created_at)", "kills")


def test_refuses_an_out_dir_that_is_not_empty(tmp_path):
    out = tmp_path / "out"
    out.mkdir()
    (out / "match_player-2026-10-01.parquet").write_bytes(b"left over")
    with pytest.raises(PipelineError, match="not empty"):
        run(two_day_dump(tmp_path), seed_state(tmp_path, "2026-10-16"), out)


def test_refuses_a_state_file_in_an_unknown_format(tmp_path):
    state = tmp_path / "state.json"
    state.write_text('{"format": 2, "watermark": 1792349580}', encoding="utf-8")
    with pytest.raises(PipelineError, match="format"):
        run(two_day_dump(tmp_path), state, tmp_path / "out")


def test_latest_rows_keeps_the_newest_copy_across_day_files(tmp_path):
    out = tmp_path / "out"
    run(two_day_dump(tmp_path), seed_state(tmp_path, "2026-10-15"), out)
    rows = latest_rows(duckdb.connect(), [str(p) for p in sorted(out.glob("*.parquet"))])
    assert rows.order("match_id").project("match_id, kills").fetchall() == [
        (1, 1),
        (2, 5),
        (3, 1),
        (5, 1),
        (6, 9),
        (8, 1),
        (9, 1),
        (10, 2),
        (11, 1),
        (12, 1),
    ]


def test_finished_days_without_one_normal_row_fail_and_leave_no_state(tmp_path):
    only_an_old_row = FixtureFile("part-11", "base", hi="2026-10-18 01:13", rows=(DumpRow(11, 0, "2026-10-16 09:00"),))
    manifest = write_dump(tmp_path / "dump", [only_an_old_row], watermark_hi="2026-10-18 03:53")
    out = tmp_path / "out"
    with pytest.raises(PipelineError, match="without one Normal row"):
        run(manifest, seed_state(tmp_path, "2026-10-16"), out)
    assert list(out.glob("*")) == []
