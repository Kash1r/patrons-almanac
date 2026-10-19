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
  release, tag `pipeline-data`, holds a file per finished UTC ingestion day
  (`match_player-YYYY-MM-DD.parquet`), the features file, and `state.json`. The state
  is `done_through`, the last ingestion day in the release. A day is the UTC date of a
  row's `created_at`, when deadlock-api stored it. The nightly workflow uploads day files
  first and `state.json` last, with `gh release upload --clobber` (needs
  `contents: write`). Release downloads redirect and then honour byte ranges (checked:
  `206` for a 100-byte range), so DuckDB can query the files where they sit. Each file
  can be up to 2 GB; a day is about 215 MB (measured on 2026-10-17). Revisit R2 or
  Hugging Face if Phase 3 needs more history than that holds comfortably.
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

That read covers the increments only. A finished day also needs the base parts; see
"Measured 2026-10-18" below.

## Measured 2026-10-18

Reading the increments alone loses rows. These numbers shaped the ingest.

- deadlock-api refolds each `match_id // 1,000,000` partition into its base part about
  hourly. When deltas roll up into a residual, rows already folded are dropped from it.
- Of the 2,174,178 unique `(match_id, player_slot)` keys stored on 2026-10-17, 883,754
  (41%) are only in base parts.
- Hourly deltas are kept about 31 hours. Older increments are day-long residuals, back
  to 2026-10-05 in manifest 839.
- Base row groups span weeks of `created_at`. One pass over 28 days reads 32.8 GB. Twenty-eight
  passes, one per day, read 516 GB (from file footers).
- One finished day reads about 3.6 GB over the network (base parts plus increments, kept
  columns only).
- The increments are not always contiguous. No residual or delta covers 2026-10-17
  15:41 to 15:49 UTC. 85 of 120 base parts end before 15:49 (manifest 840), so rows
  stored in that span may be missing. The ingest warns about such spans.
- A live run of the ingest on 2026-10-18 wrote 2026-10-17 in 254 s from a home
  connection: 1,862,964 rows, 156,151 matches, a 215 MB file.

### The ingest on a GitHub runner (2026-10-18 and 19)

The first nightly run took 28 days in one remote pass at DuckDB's default threads. It
failed on a 4-core, 16 GB `ubuntu-latest` runner. The measurements below shaped the
current design.

- The remote read waits on request latency, not CPU. Staging one day took 37 s at 256
  threads, 176 s at 64, and over 10 min at the default of 4.
- A multi-day pass at a high thread count starved the runner. Even 7 days at 128 threads
  ended with "The hosted runner lost communication with the server". Process RSS reached
  about 15 GB, and DuckDB's `memory_limit` did not bound it.
- One remote pass per day at 64 threads, then dedupe, sort and write at 4 threads, with a
  fresh DuckDB connection per day, caught up 7 days in 839 s. Peak RSS was 10.9 GB and
  reset after each day. One day took 120 s at a 6.6 GB peak.
- Sharing one connection across the 7 days peaked at 14.4 GB.
- Row counts were identical in every variant. 2026-10-17 had 1,862,964 rows and
  2026-10-18 had 2,035,021.
- One pass per day re-reads base row groups that span weeks. A 28-day backfill that way
  reads 516 GB of kept columns against 32.8 GB in one pass. A deep backfill does not
  belong in the nightly. If Phase 3 needs more history, it gets its own job.

## Pull requests, in order

1. **Pipeline skeleton.** `pipeline/` as a uv project (Python 3.12, DuckDB pinned to
   1.5.x, pytest), and a Python job in `ci.yml`.
2. **Ingest.** `nightly-pipeline.yml` on a cron writes one Parquet file per finished
   UTC ingestion day to the `pipeline-data` release, then updates `state.json`
   (`done_through`). For each new day it reads the base parts plus the residual and
   delta files that overlap it, because residuals omit rows already folded into base
   parts. It keeps normal-mode rows and 22 columns (the ones above plus
   `match_outcome`, minus `account_id`), and keeps the newest copy per
   `(match_id, player_slot)` within a day. It makes one remote pass per day, at 64
   threads. The first run takes only the newest finished day, and a run takes at most 7
   days, oldest first, so a long outage catches up over several runs. A span that no
   residual or delta covers, while some base part ends before it, prints a warning.
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
