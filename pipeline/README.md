# Pipeline

Python jobs that turn deadlock-api's `match_player` dump into training data for
Phase 3. Data from deadlock-api.com (MIT). Not affiliated with Valve.

## What the nightly job publishes

Everything lives on the GitHub release tagged `pipeline-data`:

| Asset | Holds |
| --- | --- |
| `match_player-YYYY-MM-DD.parquet` | Normal-mode player rows that deadlock-api stored on that UTC day |
| `features-YYYY-MM-DD.parquet` | One row per finished Ranked or Unranked match of that day file. See "Features" |
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
  ingests the newest complete day. A run ingests at most 7 days, oldest first, so after a
  longer outage the next runs finish the backlog. Deeper history needs a separate job.
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

To try it against live data, run it with no state file. It ingests the newest finished
day, usually yesterday (UTC), about 3.6 GB of remote reads. To start from an earlier day, seed a state with
`done_through` set to the day before it. From `pipeline/`:

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
job reads both. For each day it reads only the files that overlap that day in one
remote pass, filters on `created_at`, and Parquet row-group statistics skip the rest.

## Features

`features-YYYY-MM-DD.parquet` is built from the day file with the same date. It holds
one row per match, sorted by `match_id`, and is the input for Phase 3's win-probability
model. A match is kept when all 12 of its rows are in the day file with 6 on each team,
`match_mode` is `Ranked` or `Unranked`, `match_outcome` is `TeamWin`, and
`winning_team` is `Team0` or `Team1`. The file for 2026-10-17 has 154,089 matches in
10 MB.

| Column | Type | Holds |
| --- | --- | --- |
| `match_id` | UBIGINT | |
| `start_time` | TIMESTAMPTZ | When the match was played |
| `created_at` | TIMESTAMPTZ | When deadlock-api stored it |
| `duration_s` | UINTEGER | |
| `match_mode` | VARCHAR | `Ranked` or `Unranked` |
| `average_badge_team0`, `average_badge_team1` | UINTEGER | Null for 0.75% of the matches on 2026-10-17 |
| `team0_won` | BOOLEAN | The label. There is no `winning_team` column |
| `team0_heroes`, `team1_heroes` | UTINYINT[] | The six `hero_id` values of the team, ascending |
| `team0_souls_final`, `team1_souls_final` | BIGINT | Sum of the team's final `net_worth` |
| `team0_souls_03m`, `team1_souls_03m`, then 06, 09, 12, 15, 20, 25, 30, 35 and 40 | BIGINT | Sum of the team's `stats.net_worth` at the sample taken at that minute. Null when the match ended before it |

`SOUL_MINUTES` in `src/almanac_pipeline/features.py` lists the minutes, and the
columns follow from it. The samples fall at 3, 6, 9, 12 and 15 minutes, then every 5
minutes, then once more at the end, so no minute needs rounding. A null souls column
means the match was shorter than that minute, which is itself a signal. On 2026-10-17
the share of null matches is 0.9% at 15 minutes, 20% at 30 and 69% at 40.

`start_time` stays in the file because a day file holds many old matches stored late
(`created_at` minus `start_time` is 43 days at the 90th percentile). Filter on it to
select a date or a patch. A match that deadlock-api stores again on a later day could
appear in two files. Keep the row with the newest `created_at`. None did across the 7
days measured.

### Building features

```sh
uv run python -m almanac_pipeline features --out features days/match_player-2026-10-17.parquet
```

- `DAY_FILE` arguments must be named `match_player-YYYY-MM-DD.parquet`. The command
  writes `features-YYYY-MM-DD.parquet` for each into `--out` and prints one line per
  file, such as `features-2026-10-17: 154,089 matches`.
- A file with another name, or a day with no qualifying match, exits 1 with an
  `::error::` line. The command stops there. Earlier files stay, and no empty file is
  left behind.
- It reads the local day file only, with 4 threads. One day took 0.7 s and 0.24 GiB.
  It never calls GitHub.

The nightly workflow runs this after publishing. It lists the release, downloads
the day files that have no features file with `gh release download`, and uploads each
features file as soon as it is built. A failed day leaves only its own file missing,
fails the step, and is retried the next night. A day that never has a qualifying match
fails every night. Delete that day file from the release to clear it.
