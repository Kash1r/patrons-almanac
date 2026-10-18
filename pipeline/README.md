# Pipeline

Python jobs that turn deadlock-api's `match_player` dump into training data for
Phase 3. Data from deadlock-api.com (MIT). Not affiliated with Valve.

## What the nightly job publishes

Everything lives on the GitHub release tagged `pipeline-data`:

| Asset | Holds |
| --- | --- |
| `match_player-YYYY-MM-DD.parquet` | Normal-mode player rows that deadlock-api stored on that UTC day |
| `state.json` | `{"format": 1, "done_through": "2026-10-17", "manifest_version": 838}` |

A day is an **ingestion day**. The date is the UTC calendar date of the row's
`created_at`, which is when deadlock-api stored it, not when the match was played.
A match played on the 12th can arrive on the 17th. The `start_time` column holds
the play time.

Each day file:

- has 22 columns: `match_id`, `player_slot`, `created_at`, `start_time`,
  `duration_s`, `game_mode`, `match_mode`, `average_badge_team0`,
  `average_badge_team1`, `winning_team`, `match_outcome`, `team`, `hero_id`,
  `kills`, `deaths`, `assists`, `net_worth`, `won`, `"stats.time_stamp_s"`,
  `"stats.net_worth"`, `"items.item_id"`, `"items.game_time_s"`. It has no
  `account_id`, names or Steam data;
- holds only `game_mode = 'Normal'`, which includes the rare `PrivateLobby` and
  `CoopBot` matches, so filter on `match_mode` when you need ranked or unranked play,
  and on `match_outcome = 'TeamWin'` to drop draws and errored matches;
- is unique on `(match_id, player_slot)` and sorted by it;
- is written after its day has ended upstream, and is final once `state.json`
  covers it. A rerun after a crash may rewrite a day that `state.json` does not cover yet.

When deadlock-api stores a match again on a later day, the match also appears in
that later day's file. Read several day files through `latest_rows`, which keeps
the copy with the newest `created_at`:

```python
import duckdb
from almanac_pipeline.ingest import latest_rows

BASE = "https://github.com/Kash1r/patrons-almanac/releases/download/pipeline-data"
con = duckdb.connect()
days = [f"{BASE}/match_player-2026-10-{d:02}.parquet" for d in range(10, 18)]
rows = latest_rows(con, days)  # a DuckDB relation, one row per player per match
rows.filter("match_mode IN ('Unranked', 'Ranked')").aggregate("count(DISTINCT match_id)")
```

## Running the ingest

```sh
uv run python -m almanac_pipeline ingest --state in/state.json --out out
```

- `--state` is the release's `state.json`. A missing file means first run, which
  ingests the last 28 complete days.
- `--out` must be empty or absent. The job writes the new day files and the new
  `state.json` there. It never touches the release itself. The workflow uploads
  `out/` afterwards, day files first and `state.json` last.
- `--manifest` defaults to `https://data.deadlock-api.com/v1/manifest.json`. Tests pass
  a local manifest whose `public_url` is a local folder.

It exits non-zero on any failure. Rerunning it is safe. A run that finds no newly
finished day writes nothing to `--out`, and the workflow uploads nothing.

It prints a `::warning::` and still exits 0 in two cases. One is an upstream
watermark more than 36 hours old. The other is a span inside the new days that no
hourly or daily file covers while some base part ends before it, so rows stored
then may be missing from the day files. The warning names the UTC span. Gaps are
not stored in `state.json`.

To try it against live data without a long backfill, seed a state with
`done_through` set to the day before yesterday (UTC). That leaves yesterday as the
one day to ingest, about 3.6 GB of remote reads. From `pipeline/`:

```sh
mkdir -p in && echo '{"format": 1, "done_through": "2026-10-16", "manifest_version": 0}' > in/state.json
uv run python -m almanac_pipeline ingest --state in/state.json --out out
```

## Where the rows come from

The manifest lists two kinds of file. **Base parts** have one file per
`match_id // 1_000_000` partition, holding every row of that partition stored up
to the part's `hi`. **Increments** are hourly deltas and day-long residuals,
holding rows stored in `(lo, hi]`. deadlock-api refolds base parts about hourly.
When deltas roll up into a residual, rows already folded into a base part are
dropped from the increment. So a day's rows are spread over both kinds, and the
job reads both. It filters on `created_at`, and Parquet row-group statistics skip
the rest.
