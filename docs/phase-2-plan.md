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

So a nightly incremental read is cheap. What needs a decision is where the output lives.

## Pull requests, in order

1. **Pipeline skeleton.** `pipeline/` as a uv project (Python 3.12, DuckDB pinned to
   1.5.x, pytest), and a Python job in `ci.yml`.
2. **Ingest.** `nightly-pipeline.yml` on a cron reads every delta newer than the
   last run's watermark (the manifest's `hi`), keeps normal-mode rows and the columns
   above minus `account_id`, de-duplicates on `(match_id, player_slot)`, and writes
   date-partitioned Parquet to the chosen store. Exits non-zero on any failure, so the
   gate means something.
3. **Features.** A DuckDB step that builds one row per match: both teams' heroes,
   badges, souls at fixed minutes, and the result. This is Phase 3's input.
4. **Hero meta.** `/heroes` tier list by badge range from `/v1/analytics/hero-stats`;
   `/heroes/[id]` with counters, synergies and builds from `hero-counter-stats`,
   `hero-synergy-stats` and `hero-build-stats/{hero_id}`.
5. **Item meta.** `/items` from `/v1/analytics/item-stats`, bucketed by net worth.
6. **Home page.** Top heroes this week, and a patch banner from `/v1/patches`.

Every endpoint above is in the committed spec; confirm parameters there before use.

## Open questions for Kashir

1. **Where the pipeline's Parquet lives.** The repo is public, so all three are free:
   - GitHub Release assets: simplest, 2 GB per file, versioned by tag.
   - Cloudflare R2: 10 GB free, S3 API, DuckDB reads it directly; needs an account.
   - A Hugging Face dataset: free, public, made for this; needs an account.
   At 125 MB a day, 30 days is about 4 GB. Recommendation: Release assets until
   Phase 3 shows how much history the model needs.
2. **Tier-list ranks.** Which badge ranges get their own tier list? Recommendation:
   all ranks, plus Oracle and above, plus Eternus.
3. **"This week".** A rolling 7 days, or since the last patch? Recommendation: since the
   last patch when it is under 14 days old, else 7 days.
