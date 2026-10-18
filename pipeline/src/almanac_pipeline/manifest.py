"""Upstream format (format_version 1, measured on version 838):
tables.match_player.files[] = {key, kind: base|residual|delta, lo?, hi, ...}
A base part holds every row of its match_id partition with created_at <= hi.
A residual or delta holds rows with created_at in (lo, hi].
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import NewType

import duckdb

from almanac_pipeline import PipelineError

MANIFEST_URL = "https://data.deadlock-api.com/v1/manifest.json"

EpochSeconds = NewType("EpochSeconds", int)

_KINDS = frozenset({"base", "residual", "delta"})
# No segment starts with a dot, so no "..". All 185 keys in version 838 match.
_KEY = re.compile(r"[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*")


@dataclass(frozen=True, slots=True)
class DumpFile:
    """Rows with lo < created_at <= hi. lo = 0 marks a base part; an increment has lo > 0."""

    url: str
    lo: EpochSeconds
    hi: EpochSeconds


@dataclass(frozen=True, slots=True)
class Snapshot:
    version: int
    watermark_hi: EpochSeconds
    """Every row with created_at <= watermark_hi is in `files`."""
    files: tuple[DumpFile, ...]


def read_snapshot(location: str) -> Snapshot:
    """Fetched through DuckDB's read_text: Python's urllib with its default User-Agent gets 403
    from data.deadlock-api.com (measured 2026-10-18).
    """
    with duckdb.connect() as con:
        text = con.execute("SELECT content FROM read_text(?)", [location]).fetchone()[0]
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as e:
        raise PipelineError(f"manifest is not valid JSON: {e}") from e
    return _parse(raw)


def _require(ok: bool, problem: str) -> None:
    if not ok:
        raise PipelineError(f"manifest: {problem}")


def _whole(value: object, field: str) -> int:
    _require(type(value) is int, f"{field} is {value!r}, expected a whole number")
    return value


def _parse(raw: dict) -> Snapshot:
    try:
        return _parse_fields(raw)
    except KeyError as e:
        raise PipelineError(f"manifest: missing field {e.args[0]!r}") from e
    except (TypeError, AttributeError) as e:
        raise PipelineError(f"manifest: unexpected shape ({e})") from e


def _parse_fields(raw: dict) -> Snapshot:
    _require(raw["format_version"] == 1, f"format_version is {raw['format_version']!r}, expected 1")
    table = raw["tables"]["match_player"]
    _require(table["policy"] == "incremental", f"policy is {table['policy']!r}, expected 'incremental'")
    _require(table["watermark"] == "created_at", f"watermark is {table['watermark']!r}, expected 'created_at'")
    public_url = raw["public_url"].rstrip("/")
    files = []
    for f in table["files"]:
        key, kind = f["key"], f["kind"]
        _require(kind in _KINDS, f"unknown kind {kind!r} for {key!r}")
        _require(_KEY.fullmatch(key) is not None, f"unsafe key {key!r}")
        hi = _whole(f["hi"], f"hi of {key!r}")
        lo = 0 if kind == "base" else _whole(f["lo"], f"lo of {key!r}")
        _require(
            0 <= lo < hi and (lo == 0) == (kind == "base"),
            f"{key!r} needs lo < hi, and lo > 0 unless base; got lo={lo}, hi={hi}",
        )
        files.append(DumpFile(url=f"{public_url}/{key}", lo=EpochSeconds(lo), hi=EpochSeconds(hi)))
    return Snapshot(
        version=_whole(raw["version"], "version"),
        watermark_hi=EpochSeconds(_whole(table["watermark_hi"], "watermark_hi")),
        files=tuple(files),
    )
