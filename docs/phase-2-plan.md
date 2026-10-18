# Phase 2 plan: meta and data

Goal: hero and item meta pages, plus a nightly pipeline that turns the deadlock-api
Parquet dumps into DuckDB features. Gate: the nightly job is green.

Prepared 2026-10-18. Numbers below were measured that day.

## Decisions

- **Meta pages read the analytics endpoints.** `/heroes`, `/heroes/[id]` and `/items`
  come from `/v1/analytics/*`, cached 1 hour like other meta pages. The endpoints are
  already aggregated, current, and filter by badge, time and match mode.
- **The pipeline reads the dumps, for Phase 3.** The win-probability model needs
  per-match rows with souls over time, which only the dumps carry. The nightly job builds
  that training data; the web app does not read it in Phase 2.
- **No player identities in our data.** Players who ask deadlock-api to delete their
  data are removed from the live API, not from copies we already hold. The pipeline
  keeps match and hero data and drops `account_id`, names and Steam profiles.
- **Licence.** The dumps page links deadlock-api's MIT licence. Keep the footer credit;
  credit deadlock-api in the README and model cards.
- **The pipeline's Parquet lives in GitHub Release assets** (decided 2026-10-18). One
  release, tag `pipeline-data`, holds a file per day (`match_player-YYYY-MM-DD.parquet`),
  the features file, and `state.json` with the last manifest watermark read. The nightly
  workflow uploads with `gh release upload --clobber` (needs `contents: write`). Release
  downloads redirect and then honour byte ranges (checked: `206` for a 100-byte range),
  so DuckDB can query the files where they sit. Each file can be up to 2 GB; a day is
  about 125 MB. Revisit R2 or Hugging Face if Phase 3 needs more history than that holds
  comfortably.
- **One tier list, all ranks combined** (decided 2026-10-18). No per-rank tier lists.
- **"This week" means since the last patch while that patch is under 14 days old,
  otherwise the last 7 days** (decided 2026-10-18). The home page names the window it
  used.

## What the dumps look like

Manifest: https://data.deadlock-api.com/v1/manifest.json (hourly, DuckDB 1.5.6).

- `match_player` is one row per player per match, 157 columns, about 540 GB.
- **Base parts** (about 120) each cover a span of match start times; the largest is
  11 GB for one month of 2025.
- **Delta files** (about 50, hourly) hold rows added that hour. A delta's matches can
  start any time, back to 2024, so deltas group rows by ingestion, not by play date.
- `game_mode` and `match_mode` are strings (`'Normal'`, `'Ranked'`); `start_time` is
  a timestamp with time zone; `stats.*` and `items.*` are arrays.

## Runner test (GitHub-hosted `ubuntu-latest`, DuckDB over HTTP)

| Read, 19 columns | Remote | Time | Kept locally |
| --- | --- | --- | --- |
| One hourly delta | 0.19 GB | 0.8 s | 13 MB |
| Last 24 deltas, normal mode | 2.04 GB | 5.6 s | 125 MB: 91,168 matches, 1.09M player rows |
| Last 24 h of the largest base part | 11.07 GB | 31.5 s | 27.5 MB |

Whole job: 40 s wall time, 1.3 GB peak memory. The runner had 86 GB of free disk.
The columns were the ones a win model needs: match id, start time, duration, modes,
both teams' average badge, winning team, team, hero, K/D/A, net worth, `won`,
`stats.time_stamp_s`, `stats.net_worth`, `items.item_id`, `items.game_time_s`.

So a nightly incremental read is cheap.

## Pull requests, in order

1. **Pipeline skeleton.** `pipeline/` as a uv project (Python 3.12, DuckDB pinned to
   1.5.x, pytest), and a Python job in `ci.yml`.
2. **Ingest.** `nightly-pipeline.yml` on a cron reads every delta newer than the
   last run's watermark (the manifest's `hi`), keeps normal-mode rows and the columns
   above minus `account_id`, de-duplicates on `(match_id, player_slot)`, and writes
   one Parquet file per day to the `pipeline-data` release, then updates `state.json`.
   Exits non-zero on any failure, so the gate means something.
3. **Features.** A DuckDB step that builds one row per match: both teams' heroes,
   badges, souls at fixed minutes, and the result. This is Phase 3's input.
4. **Hero meta.** `/heroes` tier list over all ranks from `/v1/analytics/hero-stats`;
   `/heroes/[id]` with counters, synergies and builds from `hero-counter-stats`,
   `hero-synergy-stats` and `hero-build-stats/{hero_id}`.
5. **Item meta.** `/items` from `/v1/analytics/item-stats`, bucketed by net worth.
6. **Home page.** Top heroes this week (window as decided above), and a patch banner
   from `/v1/patches`.

Every endpoint above is in the committed spec; confirm parameters there before use.
