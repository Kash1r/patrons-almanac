from __future__ import annotations

import argparse
import sys
import time
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

from almanac_pipeline import PipelineError, ingest
from almanac_pipeline.manifest import MANIFEST_URL, EpochSeconds

_STALE_UPSTREAM_S = 36 * 3600


def _utc(t: EpochSeconds) -> str:
    return datetime.fromtimestamp(t, tz=UTC).strftime("%Y-%m-%d %H:%M")


def main(argv: Sequence[str] | None = None) -> int:
    """An upstream stall or a hole in the increments is not our failure: each warns without failing."""
    parser = argparse.ArgumentParser(prog="python -m almanac_pipeline")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("ingest", help="write day files for newly finished days")
    p.add_argument("--state", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--manifest", default=MANIFEST_URL)
    args = parser.parse_args(argv)
    try:
        report = ingest.run(args.manifest, args.state, args.out)
    except PipelineError as e:
        print(f"::error::{e}", file=sys.stderr)
        return 1
    for day, rows in report.written:
        print(f"{day.isoformat()}: {rows:,} rows")
    if not report.written:
        print(
            f"Nothing new: upstream watermark {_utc(report.watermark_hi)} UTC, done through {report.state.done_through}"
        )
    for after, up_to in report.gaps:
        print(
            f"::warning::No dump increment covers {_utc(after)} to {_utc(up_to)} UTC and some base parts"
            " end before it, so rows stored then may be missing from the day files"
        )
    if time.time() - report.watermark_hi > _STALE_UPSTREAM_S:
        print(f"::warning::Upstream watermark {_utc(report.watermark_hi)} UTC is more than 36 hours old")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
