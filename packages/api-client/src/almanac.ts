import { type Client, createClient } from './generated/client';
import {
  getItemsByType,
  listHeroes,
  listRanks,
  matchHistory as getMatchHistory,
  metadata as getMetadata,
  rank as getRank,
  steam,
} from './generated/sdk.gen';
import type { PlayerMatchHistoryEntry, RankResponse } from './generated/types.gen';
import { zMatchHistoryResponse } from './generated/zod.gen';
import {
  type AccountId,
  type HeroIndex,
  type MatchId,
  type PlayerMatch,
  type PlayerMatchRecord,
  type PlayerRank,
  type RankIndex,
  type SteamPersona,
  joinHeroes,
  parseHistory,
  resolveRank,
  toHeroIndex,
  toRankIndex,
  toSteamPersona,
} from './domain';
import { type ItemIndex, type MatchDetail, type MatchRecord, joinMatch, toItemIndex, toMatchRecord, zMatchMetadata } from './match';

export type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };

/** `ttlSeconds: null` keeps the value until the cache namespace changes. */
export type CachePolicy = { readonly ttlSeconds: number | null };

/**
 * Contract for every adapter:
 * - Return the stored value for `key`, or run `load`, store its result under `policy`, and return it.
 * - Never store a rejected `load`.
 * - Values round-trip through JSON.
 */
export interface CacheStore {
  getOrLoad<T extends Json>(key: string, policy: CachePolicy, load: () => Promise<T>): Promise<T>;
}

export const noCache: CacheStore = {
  getOrLoad: (_key, _policy, load) => load(),
};

export type AlmanacError =
  /** A 429 that came without usable stored history. */
  | { readonly kind: 'rate-limited' }
  /** Network failure or timeout (`status: null`), or a non-2xx answer. */
  | { readonly kind: 'upstream'; readonly status: number | null }
  /** The API answered 2xx with a body the generated schema rejects. */
  | { readonly kind: 'drift' };

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AlmanacError };

export interface AlmanacOptions {
  readonly cache: CacheStore;
  /**
   * Prefix for every cache key. Pass the deploy's commit SHA, so a deploy that changes a
   * record shape never reads entries an older shape wrote.
   */
  readonly cacheNamespace: string;
  readonly fetch?: typeof fetch;
}

export interface Almanac {
  /**
   * Every normal-mode match the API holds for the account, newest first, heroes resolved.
   * A failed hero index degrades heroes to `{ kind: 'unknown' }`; it never fails the history.
   */
  matchHistory(accountId: AccountId): Promise<Result<readonly PlayerMatch[]>>;
  /**
   * The rank after the account's latest ranked match. A failed rank index degrades the tier name
   * and badge to `null`; it never fails the rank.
   */
  playerRank(accountId: AccountId): Promise<Result<PlayerRank>>;
  /** The Steam persona, or `null` when the API holds no Steam profile for the account. */
  steamPersona(accountId: AccountId): Promise<Result<SteamPersona | null>>;
  /**
   * A finished match with heroes, shop items and Steam names resolved, or `null` when the API holds
   * no metadata for it. Failed hero, item or name lookups degrade those parts; they never fail the match.
   */
  matchDetail(matchId: MatchId): Promise<Result<MatchDetail | null>>;
}

type SourceName =
  | 'hero-index'
  | 'match-history'
  | 'rank-index'
  | 'player-rank'
  | 'steam-persona'
  | 'item-index'
  | 'match'
  | 'match-names';

const SOURCES = {
  'hero-index': { ttlSeconds: 24 * 60 * 60 },
  'match-history': { ttlSeconds: 5 * 60 },
  'rank-index': { ttlSeconds: 24 * 60 * 60 },
  'player-rank': { ttlSeconds: 5 * 60 },
  'steam-persona': { ttlSeconds: 15 * 60 },
  'item-index': { ttlSeconds: 24 * 60 * 60 },
  match: { ttlSeconds: null },
  'match-names': { ttlSeconds: 15 * 60 },
} as const satisfies Record<SourceName, CachePolicy>;

const BASE_URL = 'https://api.deadlock-api.com';
const TIMEOUT_MS = 8_000;
const USER_AGENT = 'patrons-almanac (+https://github.com/Kash1r)';

export function createAlmanac(options: AlmanacOptions): Almanac {
  const client = createClient({
    baseUrl: BASE_URL,
    fetch: options.fetch,
    // Next's fetch cache rejects entries over 2 MB (and throws in dev); the raw hero list is 1.9 MB.
    cache: 'no-store',
    headers: { 'User-Agent': USER_AGENT },
  });

  return {
    async matchHistory(accountId) {
      const [history, heroes] = await Promise.all([
        readThrough(options, 'match-history', [accountId], () => loadMatchHistory(client, accountId)),
        readThrough(options, 'hero-index', [], () => loadHeroIndex(client)),
      ]);
      if (!history.ok) return history;
      return { ok: true, value: joinHeroes(history.value, heroes.ok ? heroes.value : {}) };
    },

    async playerRank(accountId) {
      const [rank, ranks] = await Promise.all([
        readThrough(options, 'player-rank', [accountId], () => loadRank(client, accountId)),
        readThrough(options, 'rank-index', [], () => loadRankIndex(client)),
      ]);
      if (!rank.ok) return rank;
      return { ok: true, value: resolveRank(ranks.ok ? ranks.value : {}, rank.value) };
    },

    steamPersona(accountId) {
      return readThrough(options, 'steam-persona', [accountId], () => loadSteamPersona(client, accountId));
    },

    async matchDetail(matchId) {
      const [match, heroes, items] = await Promise.all([
        readThrough(options, 'match', [matchId], () => loadMatch(client, matchId)),
        readThrough(options, 'hero-index', [], () => loadHeroIndex(client)),
        readThrough(options, 'item-index', [], () => loadItemIndex(client)),
      ]);
      if (!match.ok) {
        return match.error.kind === 'upstream' && match.error.status === 404 ? { ok: true, value: null } : match;
      }
      const names = await readThrough(options, 'match-names', [matchId], () =>
        loadNames(client, match.value.players.map((p) => p.accountId)),
      );
      return {
        ok: true,
        value: joinMatch(match.value, heroes.ok ? heroes.value : {}, items.ok ? items.value : null, names.ok ? names.value : {}),
      };
    },
  };
}

class UpstreamFailure extends Error {
  constructor(readonly failure: AlmanacError) {
    super(`deadlock-api ${failure.kind}`);
  }
}

async function readThrough<T extends Json>(
  options: AlmanacOptions,
  source: SourceName,
  keyParts: readonly (string | number)[],
  load: () => Promise<T>,
): Promise<Result<T>> {
  const key = [options.cacheNamespace, source, ...keyParts].join(':');
  try {
    return { ok: true, value: await options.cache.getOrLoad(key, SOURCES[source], load) };
  } catch (e) {
    if (e instanceof UpstreamFailure) return { ok: false, error: e.failure };
    throw e;
  }
}

/** A 429 here still carries the stored history in the 200 body shape, so it parses as success. */
async function loadMatchHistory(client: Client, accountId: AccountId): Promise<readonly PlayerMatchRecord[]> {
  const outcome = await getMatchHistory({
    client,
    path: { account_id: accountId },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const rows = outcome.response?.status === 429 ? storedHistoryOr429(outcome.error) : unwrap('match-history', outcome);
  const { matches, unreadable } = parseHistory(rows);
  if (unreadable > 0) console.warn(`[almanac] match-history: ${unreadable} rows with unknown team codes`);
  return matches;
}

/** The SDK skips response validation on a 429, so the stored-history body is validated here. */
function storedHistoryOr429(body: unknown): readonly PlayerMatchHistoryEntry[] {
  const stored = zMatchHistoryResponse.safeParse(body);
  if (!stored.success) throw new UpstreamFailure({ kind: 'rate-limited' });
  return stored.data;
}

async function loadHeroIndex(client: Client): Promise<HeroIndex> {
  return toHeroIndex(unwrap('hero-index', await listHeroes({ client, signal: AbortSignal.timeout(TIMEOUT_MS) })));
}

/** Stores the raw response: it is four small integers and one optional object. */
async function loadRank(client: Client, accountId: AccountId): Promise<RankResponse> {
  return unwrap('player-rank', await getRank({ client, path: { account_id: accountId }, signal: AbortSignal.timeout(TIMEOUT_MS) }));
}

async function loadRankIndex(client: Client): Promise<RankIndex> {
  return toRankIndex(unwrap('rank-index', await listRanks({ client, signal: AbortSignal.timeout(TIMEOUT_MS) })));
}

/** The API answers 404 when it holds no Steam profile for the account. */
async function loadSteamPersona(client: Client, accountId: AccountId): Promise<SteamPersona | null> {
  const outcome = await steam({ client, query: { account_ids: [accountId] }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (outcome.response?.status === 404) return null;
  return toSteamPersona(unwrap('steam-persona', outcome));
}

/**
 * Steam fallback is off: without it an unknown match answers 404 at once; with it, 503 "recently failed"
 * (measured), and the fallback's 3 requests per hour per IP would go to typos.
 * A 404 rejects, so it is never stored, and the match can appear once the API ingests it.
 */
async function loadMatch(client: Client, matchId: MatchId): Promise<MatchRecord> {
  const outcome = await getMetadata({
    client,
    path: { match_id: matchId },
    query: { disable_steam: true },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const parsed = zMatchMetadata.safeParse(unwrap('match', outcome));
  const record = parsed.success ? toMatchRecord(parsed.data) : null;
  if (record === null) {
    console.error('[almanac] match: metadata failed validation', parsed.error?.message.slice(0, 2000) ?? 'unknown team code');
    throw new UpstreamFailure({ kind: 'drift' });
  }
  return record;
}

async function loadItemIndex(client: Client): Promise<ItemIndex> {
  return toItemIndex(
    unwrap('item-index', await getItemsByType({ client, path: { type: 'upgrade' }, signal: AbortSignal.timeout(TIMEOUT_MS) })),
  );
}

/** Account 0 is a bot or hidden player; asking for it 400s the whole batch. */
async function loadNames(client: Client, accountIds: readonly AccountId[]): Promise<{ [accountId: string]: string }> {
  const ids = accountIds.filter((id) => id > 0);
  if (ids.length === 0) return {};
  const outcome = await steam({ client, query: { account_ids: ids }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (outcome.response?.status === 404) return {};
  return Object.fromEntries(unwrap('match-names', outcome).map((p) => [String(p.account_id), p.personaname]));
}

type SdkOutcome<T> = { readonly data: T | undefined; readonly error: unknown; readonly response?: Response };

/**
 * The SDK never throws (measured):
 *   error, no response          -> upstream, status null (network, timeout)
 *   error, response.ok          -> drift (the SDK's zod response validator rejected the body)
 */
function unwrap<T>(source: SourceName, { data, error, response }: SdkOutcome<T>): T {
  if (error === undefined && data !== undefined) return data;
  if (response === undefined) throw new UpstreamFailure({ kind: 'upstream', status: null });
  if (response.ok) {
    console.error(`[almanac] ${source}: response failed schema validation`, String(error).slice(0, 2000));
    throw new UpstreamFailure({ kind: 'drift' });
  }
  if (response.status === 429) throw new UpstreamFailure({ kind: 'rate-limited' });
  throw new UpstreamFailure({ kind: 'upstream', status: response.status });
}
