from datetime import date

from fake_dump import ts

from almanac_pipeline.ingest import Plan, State, plan
from almanac_pipeline.manifest import DumpFile, EpochSeconds, Snapshot


def snapshot(watermark_hi: str, *files: DumpFile) -> Snapshot:
    return Snapshot(version=900, watermark_hi=EpochSeconds(ts(watermark_hi)), files=files)


def base(name: str, hi: str) -> DumpFile:
    return DumpFile(url=name, lo=EpochSeconds(0), hi=EpochSeconds(ts(hi)))


def increment(name: str, lo: str, hi: str) -> DumpFile:
    return DumpFile(url=name, lo=EpochSeconds(ts(lo)), hi=EpochSeconds(ts(hi)))


def test_first_run_takes_only_the_newest_finished_day():
    p = plan(None, snapshot("2026-10-18 03:53"))
    assert p.days == (date(2026, 10, 17),)
    assert p.state == State(done_through=date(2026, 10, 17), manifest_version=900)


def test_nightly_run_takes_the_one_new_day():
    assert plan(State(date(2026, 10, 16), 830), snapshot("2026-10-18 03:53")).days == (date(2026, 10, 17),)


def test_rerun_on_the_same_day_plans_nothing_and_keeps_the_state_as_it_was():
    p = plan(State(date(2026, 10, 17), 838), snapshot("2026-10-18 18:53", base("part-119", "2026-10-18 18:53")))
    assert p == Plan(days=(), files=(), gaps=(), state=State(date(2026, 10, 17), 838))


def test_missed_nights_are_caught_up_in_one_run():
    p = plan(State(date(2026, 10, 13), 700), snapshot("2026-10-18 03:53"))
    assert p.days == (date(2026, 10, 14), date(2026, 10, 15), date(2026, 10, 16), date(2026, 10, 17))


def test_a_state_10_days_behind_plans_7_days_and_stops_the_state_at_the_7th():
    p = plan(State(date(2026, 10, 7), 700), snapshot("2026-10-18 03:53"))
    assert p.days == (
        date(2026, 10, 8),
        date(2026, 10, 9),
        date(2026, 10, 10),
        date(2026, 10, 11),
        date(2026, 10, 12),
        date(2026, 10, 13),
        date(2026, 10, 14),
    )
    assert p.state == State(done_through=date(2026, 10, 14), manifest_version=900)


def test_the_run_after_a_capped_run_picks_up_the_remaining_3_days():
    p = plan(State(date(2026, 10, 14), 900), snapshot("2026-10-18 03:53"))
    assert p.days == (date(2026, 10, 15), date(2026, 10, 16), date(2026, 10, 17))
    assert p.state == State(done_through=date(2026, 10, 17), manifest_version=900)


def test_exactly_7_missed_days_take_one_run():
    p = plan(State(date(2026, 10, 10), 700), snapshot("2026-10-18 03:53"))
    assert (p.days[0], p.days[-1], len(p.days)) == (date(2026, 10, 11), date(2026, 10, 17), 7)


def test_a_watermark_on_midnight_finishes_the_day_before_it():
    assert plan(State(date(2026, 10, 16), 1), snapshot("2026-10-18 00:00")).days == (date(2026, 10, 17),)
    assert plan(State(date(2026, 10, 16), 1), snapshot("2026-10-17 23:59")).days == ()


def test_a_manifest_older_than_the_state_never_moves_it_back():
    p = plan(State(date(2026, 10, 17), 838), snapshot("2026-10-15 10:00"))
    assert (p.days, p.state.done_through) == ((), date(2026, 10, 17))


def test_reads_every_file_that_can_hold_a_row_stored_on_the_planned_days():
    files = (
        base("part-folded-before", "2026-10-16 23:59"),
        base("part-refolded-since", "2026-10-18 01:13"),
        base("part-hi-on-start", "2026-10-17 00:00"),
        increment("residual-straddling-start", "2026-10-16 15:15", "2026-10-17 11:57"),
        increment("delta-ending-on-start", "2026-10-16 23:00", "2026-10-17 00:00"),
        increment("delta-straddling-end", "2026-10-17 23:53", "2026-10-18 00:53"),
        increment("delta-after", "2026-10-18 00:00", "2026-10-18 00:53"),
    )
    p = plan(State(date(2026, 10, 16), 1), snapshot("2026-10-18 03:53", *files))
    assert [f.url for f in p.files] == [
        "part-refolded-since",
        "part-hi-on-start",
        "residual-straddling-start",
        "delta-ending-on-start",
        "delta-straddling-end",
    ]


NIGHTLY_INCREMENTS = (
    increment("residual", "2026-10-16 15:15", "2026-10-17 11:57"),
    increment("delta-a", "2026-10-17 11:57", "2026-10-17 12:57"),
    increment("delta-b", "2026-10-17 23:53", "2026-10-18 00:53"),
)


def test_a_hole_between_increments_is_a_gap_when_a_base_part_ends_before_it_does():
    files = (base("part-stale", "2026-10-16 10:00"), base("part-fresh", "2026-10-18 01:13"), *NIGHTLY_INCREMENTS)
    p = plan(State(date(2026, 10, 16), 1), snapshot("2026-10-18 03:53", *files))
    assert p.gaps == ((ts("2026-10-17 12:57"), ts("2026-10-17 23:53")),)


def test_a_hole_between_increments_is_harmless_when_every_base_part_reaches_its_end():
    files = (base("part-on-the-edge", "2026-10-17 23:53"), base("part-fresh", "2026-10-18 01:13"), *NIGHTLY_INCREMENTS)
    p = plan(State(date(2026, 10, 16), 1), snapshot("2026-10-18 03:53", *files))
    assert p.gaps == ()


def test_an_increment_inside_a_longer_one_does_not_open_a_gap():
    files = (
        base("part-stale", "2026-10-16 10:00"),
        increment("residual", "2026-10-16 15:15", "2026-10-17 11:57"),
        increment("delta-inside", "2026-10-17 01:00", "2026-10-17 02:00"),
        increment("delta-a", "2026-10-17 11:57", "2026-10-18 00:53"),
    )
    assert plan(State(date(2026, 10, 16), 1), snapshot("2026-10-18 03:53", *files)).gaps == ()


def test_days_before_the_oldest_increment_are_a_gap():
    files = (base("part-stale", "2026-10-14 10:00"), increment("residual", "2026-10-16 15:15", "2026-10-18 03:53"))
    p = plan(State(date(2026, 10, 14), 1), snapshot("2026-10-18 03:53", *files))
    assert p.gaps == ((ts("2026-10-15 00:00"), ts("2026-10-16 15:15")),)


def test_a_day_with_no_increment_at_all_is_one_gap():
    p = plan(State(date(2026, 10, 16), 1), snapshot("2026-10-18 03:53", base("part-stale", "2026-10-16 10:00")))
    assert p.gaps == ((ts("2026-10-17 00:00"), ts("2026-10-18 00:00")),)


def test_a_capped_run_reports_only_the_gaps_inside_the_days_it_plans():
    files = (
        base("part-stale", "2026-10-08 10:00"),
        increment("residual-a", "2026-10-08 00:00", "2026-10-15 00:00"),
        increment("residual-b", "2026-10-16 12:00", "2026-10-18 03:53"),
    )
    first_run = plan(State(date(2026, 10, 7), 1), snapshot("2026-10-18 03:53", *files))
    assert first_run.gaps == ()
    next_run = plan(State(date(2026, 10, 14), 1), snapshot("2026-10-18 03:53", *files))
    assert next_run.gaps == ((ts("2026-10-15 00:00"), ts("2026-10-16 12:00")),)
