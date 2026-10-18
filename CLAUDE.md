# Patron's Almanac

A Deadlock stats site: player profiles, match breakdowns, hero and item meta, and
leaderboards, with a 1920s art deco / occult look. Portfolio project, built solo at
6 to 10 hours a week. Owner: Kashir Khan (github.com/Kash1r).

All game data comes from the open Deadlock API (deadlock-api.com). Never scrape or
copy Statlocker (statlocker.gg): no code, assets, layouts or name.

## Constraints

- $0 hosting: Vercel Hobby (web), a free Python host, Upstash Redis free tier.
- Portfolio audience, not a public launch. Cold starts are fine.
- Normal game mode only in v1. Street Brawl comes later.
- Demo profile and test case: my own account, Steam account ID `256939921`.

## Stack

| Layer | Choice |
| --- | --- |
| Web | Next.js (App Router) + TypeScript, in `apps/web` |
| Styling | Tailwind CSS with tokens from `docs/design/tokens.json` |
| API client | Generated from https://api.deadlock-api.com/openapi.json, in `packages/api-client` |
| Data service | Python 3.12 + FastAPI, in `services/insights` (Phase 3) |
| Analytics store | DuckDB + Parquet files (Phase 2) |
| Pipeline | Python jobs on a GitHub Actions cron, in `pipeline/` (Phase 2) |
| ML | scikit-learn / LightGBM, MLflow tracking (Phase 3) |
| Cache | Upstash Redis |
| Tests and CI | Vitest, Playwright, pytest, GitHub Actions |
| Tooling | pnpm workspaces (TypeScript), uv (Python) |

## Repo layout (target)

```
apps/web/             Next.js app
packages/api-client/  generated client + cache wrapper
packages/ui/          deco components: Card, Rule, Sigil, StatBlock
services/insights/    FastAPI: /win-prob, /draft, /percentile
pipeline/             ingest, features, train
notebooks/            EDA and model card sources
docs/design/          brand-book.md, tokens.json
.github/workflows/    ci.yml, nightly-pipeline.yml
```

## Data rules

- The API's OpenAPI spec is the source of truth. Regenerate the client rather than
  hand-writing response types. Confirm endpoint paths in the spec before using them.
- Parse API responses at the boundary (the api-client package); trust types inside.
- When the live API disagrees with the spec, add a patch with measured evidence to
  `packages/api-client/openapi/patches.ts` and regenerate. Never edit generated code.
  Where the spec has no response schema, validate only the fields used, as in
  `packages/api-client/src/match.ts`.
- Analytics endpoints share one rate limit: 200 requests/min per IP, 400 with a key.
  Never call the API from the browser. Go through the server and the cache.
- Cache: assets daily; meta pages 1 hour; player and match pages 5 to 15 minutes;
  finished match metadata indefinitely.
- Show "Data from deadlock-api.com. Not affiliated with Valve." in the footer.
  Use hero and item art only as the API's assets endpoints serve it.
- Bulk data (Phase 2 on) comes from the hourly Parquet dumps listed in
  https://data.deadlock-api.com/v1/manifest.json. `match_player` alone is about
  540 GB, so jobs read only the columns and recent partitions they need, never
  the whole table.

## Design

Before any UI work, read `docs/design/brand-book.md` and use the tokens in
`docs/design/tokens.json`. Never hard-code a colour, font size or spacing value that
a token covers. Every number is set in the mono family. Win/loss and team colours
always carry a word or label, never colour alone. Dusk (dark) is the default theme;
Parchment (light) is the alternate.

## v1 routes

| Route | Shows |
| --- | --- |
| `/` | Search, top heroes this week, patch banner |
| `/player/[accountId]` | Rank, win rate, KDA, top heroes, last 20 matches; All, Ranked and Unranked tabs |
| `/match/[matchId]` | Scoreboards, item timelines, souls and damage curves |
| `/heroes`, `/heroes/[id]` | Tier list by rank; counters, synergies, builds |
| `/items` | Item win and pick rates, net-worth adjusted |
| `/leaderboard` | Top players by region |

Every stat shows its sample size; win rates under 50 matches are shown muted with
"low sample". Every page has loading, empty and error states.

## Roadmap

1. **Phase 0, week 1: Foundations.** Monorepo, generated API client, theme tokens,
   CI, Vercel deploy. Gate: a live URL rendering my match history.
2. **Phase 1, weeks 2 to 4: Core pages.** Search, player profile, match detail,
   leaderboard. Gate: my profile loads end to end.
3. **Phase 2, weeks 5 to 6: Meta and data.** Hero and item meta; dump ingest to
   Parquet; DuckDB features. Gate: nightly job green.
4. **Phase 3, weeks 7 to 9: ML insights.** Win probability first, then draft
   advantage and percentiles; a model card per model. Gate: win model beats a
   net-worth-only baseline on log loss.
5. **Phase 4, week 10: Launch.** Performance and accessibility pass, README with
   screenshots and live link, portfolio write-up.

Phase 0 is done (2026-10-13). Live site: https://patrons-almanac.vercel.app/player/256939921

Phase 1 is done (2026-10-14): PRs #7 to #11. `/` has search only; top heroes this
week and the patch banner move to Phase 2 with the hero meta.

Current phase: **Phase 2**. Plan, decisions and measurements: `docs/phase-2-plan.md`.

## Working style

- Use `/pstack:poteto-mode` for non-trivial tasks (feature, prototype, bug fix
  playbooks). Skip Graphite-based playbooks; this is a solo repo with plain PRs.
- Small, verifiable steps. Prove a change works by running it, not by "it compiles".
- Keep commits focused, with plain messages.

## Commands

- Install: `pnpm install`
- Dev server: `pnpm --filter web dev`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test`
- Build: `pnpm build`
- Regenerate API client and token CSS from the committed sources: `pnpm gen`
- Pull the latest API spec, then regenerate: `pnpm --filter @almanac/api-client spec:pull && pnpm gen`
- Live API test: `ALMANAC_LIVE=1 pnpm --filter @almanac/api-client test test/live.test.ts`
- E2E: `pnpm --filter web e2e`. It builds and starts the app unless one already runs on port 3000.
  Set `E2E_BASE_URL` to test a deploy. Install the browser once with
  `pnpm --filter web exec playwright install chromium`.
