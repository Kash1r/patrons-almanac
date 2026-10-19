import json
import time

from fake_dump import roster, seed_state, ts, two_day_dump, write_dump_file

from almanac_pipeline.__main__ import main


def ingest(tmp_path, done_through: str, manifest: str | None = None) -> int:
    return main(
        [
            "ingest",
            "--manifest",
            manifest or two_day_dump(tmp_path),
            "--state",
            str(seed_state(tmp_path, done_through)),
            "--out",
            str(tmp_path / "out"),
        ]
    )


def test_prints_each_day_written_and_exits_zero(tmp_path, capsys, monkeypatch):
    monkeypatch.setattr(time, "time", lambda: ts("2026-10-18 04:17"))
    assert ingest(tmp_path, "2026-10-16") == 0
    assert capsys.readouterr().out == "2026-10-17: 8 rows\n"


def test_nothing_new_is_a_success_and_writes_nothing(tmp_path, capsys, monkeypatch):
    monkeypatch.setattr(time, "time", lambda: ts("2026-10-18 10:00"))
    assert ingest(tmp_path, "2026-10-17") == 0
    assert capsys.readouterr().out == "Nothing new: upstream watermark 2026-10-18 03:53 UTC, done through 2026-10-17\n"
    assert list((tmp_path / "out").glob("*")) == []


def test_a_span_no_increment_covers_warns_without_failing(tmp_path, capsys, monkeypatch):
    monkeypatch.setattr(time, "time", lambda: ts("2026-10-18 04:17"))
    assert ingest(tmp_path, "2026-10-14") == 0
    assert capsys.readouterr().out == (
        "2026-10-15: 0 rows\n"
        "2026-10-16: 3 rows\n"
        "2026-10-17: 8 rows\n"
        "::warning::No dump increment covers 2026-10-15 00:00 to 2026-10-16 15:15 UTC and some base parts end"
        " before it, so rows stored then may be missing from the day files\n"
    )


def test_a_stalled_upstream_warns_without_failing(tmp_path, capsys, monkeypatch):
    monkeypatch.setattr(time, "time", lambda: ts("2026-10-20 12:00"))
    assert ingest(tmp_path, "2026-10-17") == 0
    assert capsys.readouterr().out == (
        "Nothing new: upstream watermark 2026-10-18 03:53 UTC, done through 2026-10-17\n"
        "::warning::Upstream watermark 2026-10-18 03:53 UTC is more than 36 hours old\n"
    )


def test_a_broken_manifest_exits_one_with_an_error_annotation(tmp_path, capsys):
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"format_version": 2}), encoding="utf-8")
    assert ingest(tmp_path, "2026-10-16", str(manifest)) == 1
    assert capsys.readouterr().err.startswith("::error::")
    assert not (tmp_path / "out" / "state.json").exists()


def test_features_writes_a_file_named_after_each_day_file_and_prints_one_line_each(tmp_path, capsys):
    write_dump_file(tmp_path / "in" / "match_player-2026-10-16.parquet", roster(1))
    write_dump_file(tmp_path / "in" / "match_player-2026-10-17.parquet", roster(1) + roster(2))
    days = [str(tmp_path / "in" / f"match_player-2026-10-{d}.parquet") for d in (16, 17)]
    assert main(["features", "--out", str(tmp_path / "out"), *days]) == 0
    assert capsys.readouterr().out == "features-2026-10-16: 1 matches\nfeatures-2026-10-17: 2 matches\n"
    assert sorted(p.name for p in (tmp_path / "out").iterdir()) == [
        "features-2026-10-16.parquet",
        "features-2026-10-17.parquet",
    ]


def test_features_rejects_a_file_that_is_not_a_day_file_and_writes_nothing(tmp_path, capsys):
    bad = tmp_path / "in" / "match_player-2026-10-17.csv"
    write_dump_file(bad, roster(1))
    assert main(["features", "--out", str(tmp_path / "out"), str(bad)]) == 1
    assert capsys.readouterr().err == (
        "::error::match_player-2026-10-17.csv is not named match_player-YYYY-MM-DD.parquet\n"
    )
    assert list((tmp_path / "out").glob("*")) == []


def test_features_warns_on_a_day_with_no_qualifying_match_and_still_writes_its_file(tmp_path, capsys):
    good = tmp_path / "in" / "match_player-2026-10-16.parquet"
    empty = tmp_path / "in" / "match_player-2026-10-17.parquet"
    write_dump_file(good, roster(1))
    write_dump_file(empty, roster(2, match_mode="CoopBot"))
    assert main(["features", "--out", str(tmp_path / "out"), str(good), str(empty)]) == 0
    assert capsys.readouterr().out == (
        "features-2026-10-16: 1 matches\n"
        "features-2026-10-17: 0 matches\n"
        "::warning::match_player-2026-10-17.parquet has no Ranked or Unranked match"
        " with a full roster and a winning team\n"
    )
    assert sorted(p.name for p in (tmp_path / "out").iterdir()) == [
        "features-2026-10-16.parquet",
        "features-2026-10-17.parquet",
    ]
