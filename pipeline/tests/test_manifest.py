import json
from pathlib import Path

import pytest

from almanac_pipeline import PipelineError
from almanac_pipeline.manifest import DumpFile, read_snapshot

EXCERPT = Path(__file__).parent / "fixtures" / "manifest-v838-excerpt.json"
TABLES = "https://data.deadlock-api.com/v1/tables/match_player/g2"


def test_reads_an_excerpt_of_the_real_manifest():
    s = read_snapshot(str(EXCERPT))
    assert (s.version, s.watermark_hi) == (838, 1792349580)
    assert s.files == (
        DumpFile(f"{TABLES}/base/part-11/20261018T042300Z-10620e56275a.parquet", 0, 1792297380),
        DumpFile(f"{TABLES}/base/part-116/20261018T175300Z-6a7f8a5873b7.parquet", 0, 1792345980),
        DumpFile(f"{TABLES}/residual/20261006T092000Z-20261007T055300Z-591d0bb4b533.parquet", 1791278400, 1791352380),
        DumpFile(f"{TABLES}/delta/20261018T165300Z-20261018T175300Z-6a7f8a5873b7.parquet", 1792342380, 1792345980),
        DumpFile(f"{TABLES}/delta/20261018T175300Z-20261018T185300Z-5b633ba1806d.parquet", 1792345980, 1792349580),
    )


def _table(m):
    return m["tables"]["match_player"]


@pytest.mark.parametrize(
    ("break_it", "names"),
    [
        (lambda m: m.update(format_version=2), "format_version is 2"),
        (lambda m: m.pop("tables"), "missing field 'tables'"),
        (lambda m: _table(m).update(policy="full"), "policy is 'full'"),
        (lambda m: _table(m).update(watermark="start_time"), "watermark is 'start_time'"),
        (lambda m: _table(m)["files"][0].update(kind="snapshot"), "unknown kind 'snapshot'"),
        (lambda m: _table(m)["files"][2].pop("lo"), "missing field 'lo'"),
        (lambda m: _table(m)["files"][2].update(lo=1791352380), "lo < hi"),
        (lambda m: _table(m)["files"][2].update(lo=0), "lo > 0 unless base"),
        (lambda m: _table(m)["files"][0].update(key="v1/../../etc/passwd"), "unsafe key"),
    ],
)
def test_refuses_a_manifest_that_breaks_an_assumption(tmp_path, break_it, names):
    raw = json.loads(EXCERPT.read_text(encoding="utf-8"))
    break_it(raw)
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(PipelineError, match=names):
        read_snapshot(str(path))
