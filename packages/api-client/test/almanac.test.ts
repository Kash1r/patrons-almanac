import { describe, expect, it } from 'vitest';
import heroes from './fixtures/heroes.json';
import history from './fixtures/match-history.json';
import leaderboardBody from './fixtures/leaderboard.json';
import matchMetadata from './fixtures/match-metadata.json';
import upgrades from './fixtures/upgrades.json';
import rank from './fixtures/rank.json';
import ranks from './fixtures/ranks.json';
import steamProfiles from './fixtures/steam.json';
import { type CacheStore, createAlmanac, noCache } from '../src/almanac';
import { type AccountId, type MatchId, type SearchQuery, parseAccountId, parseSearchQuery } from '../src/domain';
import { parseMatchId } from '../src/match';

const ME = parseAccountId('256939921') as AccountId;

type Reply = { status: number; body: unknown } | 'network-error';

const ROUTES = {
  '/v1/players/256939921/match-history': 'history',
  '/v1/assets/heroes': 'heroes',
  '/v1/players/256939921/rank': 'rank',
  '/v1/assets/ranks': 'ranks',
  '/v1/players/steam': 'steam',
  '/v1/matches/116413049/metadata': 'match',
  '/v1/assets/items/by-type/upgrade': 'items',
  '/v1/players/steam-search': 'search',
  '/v1/leaderboard/Europe': 'leaderboard',
} as const;

type Replies = Partial<Record<(typeof ROUTES)[keyof typeof ROUTES], Reply>>;

function upstream(replies: Replies): typeof fetch {
  return async (input) => {
    const { pathname } = new URL(input instanceof Request ? input.url : input);
    if (!(pathname in ROUTES)) throw new Error(`unexpected upstream path ${pathname}`);
    const reply = replies[ROUTES[pathname as keyof typeof ROUTES]];
    if (reply === undefined) throw new Error(`no reply set for ${pathname}`);
    if (reply === 'network-error') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

function recordingCache(): CacheStore & { stored: string[] } {
  const stored: string[] = [];
  return {
    stored,
    async getOrLoad(key, _policy, load) {
      const value = await load();
      stored.push(key);
      return value;
    },
  };
}

const almanacWith = (replies: Replies, cache: CacheStore = noCache) =>
  createAlmanac({ cache, cacheNamespace: 'test', fetch: upstream(replies) });

describe('matchHistory', () => {
  it('returns normal-mode matches newest first with heroes resolved', async () => {
    const result = await almanacWith({ history: { status: 200, body: history }, heroes: { status: 200, body: heroes } }).matchHistory(ME);
    expect(result.ok && result.value.map((m) => [m.matchId, m.result, m.hero.kind])).toEqual([
      [115738165, 'win', 'known'],
      [115617911, 'win', 'known'],
      [115122196, 'win', 'unknown'],
      [115097176, 'loss', 'known'],
      [96345729, 'win', 'unknown'],
    ]);
  });

  it('treats a 429 carrying stored history as success', async () => {
    const ok = await almanacWith({ history: { status: 200, body: history }, heroes: { status: 200, body: heroes } }).matchHistory(ME);
    const limited = await almanacWith({ history: { status: 429, body: history }, heroes: { status: 200, body: heroes } }).matchHistory(ME);
    expect(limited).toEqual(ok);
  });

  it('reports a bare 429 as rate-limited', async () => {
    const result = await almanacWith({ history: { status: 429, body: 'Too Many Requests' }, heroes: { status: 200, body: heroes } }).matchHistory(ME);
    expect(result).toEqual({ ok: false, error: { kind: 'rate-limited' } });
  });

  it('keeps the history when the hero index fails', async () => {
    const result = await almanacWith({ history: { status: 200, body: history }, heroes: { status: 500, body: 'boom' } }).matchHistory(ME);
    expect(result.ok && result.value.map((m) => [m.matchId, m.hero])).toEqual([
      [115738165, { kind: 'unknown', id: 65 }],
      [115617911, { kind: 'unknown', id: 65 }],
      [115122196, { kind: 'unknown', id: 7 }],
      [115097176, { kind: 'unknown', id: 65 }],
      [96345729, { kind: 'unknown', id: 2 }],
    ]);
  });

  it.each([
    [{ status: 500, body: 'boom' }, { kind: 'upstream', status: 500 }],
    ['network-error', { kind: 'upstream', status: null }],
    [{ status: 200, body: [{ match_id: 'not a number' }] }, { kind: 'drift' }],
  ] as const)('classifies %j as %j', async (reply, error) => {
    const result = await almanacWith({ history: reply, heroes: { status: 200, body: heroes } }).matchHistory(ME);
    expect(result).toEqual({ ok: false, error });
  });

  it('stores successes and never stores a failure', async () => {
    const cache = recordingCache();
    await almanacWith({ history: { status: 500, body: 'boom' }, heroes: { status: 200, body: heroes } }, cache).matchHistory(ME);
    expect(cache.stored).toEqual(['test:hero-index']);
  });
});

describe('playerRank', () => {
  it('resolves the tier name and subrank badge, dated by the last ranked match', async () => {
    const result = await almanacWith({ rank: { status: 200, body: rank }, ranks: { status: 200, body: ranks } }).playerRank(ME);
    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'ranked', tier: 11, subrank: 2, name: 'Eternus',
        badgeUrl: 'https://api.deadlock-api.com/v1/assets/ranks/11/2/image?format=webp', asOf: 1791940874,
      },
    });
  });

  it('keeps the rank when the rank index fails', async () => {
    const result = await almanacWith({ rank: { status: 200, body: rank }, ranks: { status: 500, body: 'boom' } }).playerRank(ME);
    expect(result.ok && result.value).toEqual({ kind: 'ranked', tier: 11, subrank: 2, name: null, badgeUrl: null, asOf: 1791940874 });
  });

  it('reports a protected account as an upstream 403', async () => {
    const result = await almanacWith({ rank: { status: 403, body: 'protected' }, ranks: { status: 200, body: ranks } }).playerRank(ME);
    expect(result).toEqual({ ok: false, error: { kind: 'upstream', status: 403 } });
  });
});

describe('steamPersona', () => {
  it('returns the persona name', async () => {
    expect(await almanacWith({ steam: { status: 200, body: steamProfiles } }).steamPersona(ME)).toEqual({ ok: true, value: { name: 'Kashir' } });
  });

  it.each([
    [{ status: 404, body: 'No Steam profile found.' }],
    [{ status: 200, body: [] }],
  ] as const)('returns null for %j', async (reply) => {
    expect(await almanacWith({ steam: reply }).steamPersona(ME)).toEqual({ ok: true, value: null });
  });
});

describe('matchDetail', () => {
  const MATCH = parseMatchId('116413049') as MatchId;
  const healthy = {
    match: { status: 200, body: matchMetadata },
    heroes: { status: 200, body: heroes },
    items: { status: 200, body: upgrades },
    steam: { status: 200, body: steamProfiles },
  } as const;

  it('joins heroes, shop items and names, team by team in slot order', async () => {
    const result = await almanacWith(healthy).matchDetail(MATCH);
    if (!result.ok || result.value === null) throw new Error('expected a match');
    const { players, winner, durationS } = result.value;
    expect([winner, durationS, players.length]).toEqual(['amber', 1682, 12]);
    expect(players.map((p) => p.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const me = players.find((p) => p.accountId === 256939921)!;
    expect([me.name, me.team, me.hero.id, me.kills, me.deaths, me.assists, me.souls]).toEqual(['Kashir', 'sapphire', 25, 6, 5, 13, 27332]);
    expect(players.find((p) => p.accountId !== 256939921)!.name).toBeNull();
    expect(me.items!.slice(0, 3).map((i) => [i.item.name, i.boughtAtS, i.soldAtS])).toEqual([
      ['High-Velocity Rounds', 97, 172],
      ['Opening Rounds', 172, null],
      ['Extra Health', 271, 694],
    ]);
    expect(me.curve.map((c) => c.atS)).toEqual([180, 360, 540, 720, 900, 1200, 1500, 1682]);
    expect(me.heroDamage).toBe(me.curve.at(-1)!.heroDamage);
  });

  it('asks without the Steam fallback', async () => {
    const urls: string[] = [];
    const fetchSpy: typeof fetch = (input, init) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return upstream(healthy)(input, init);
    };
    await createAlmanac({ cache: noCache, cacheNamespace: 'test', fetch: fetchSpy }).matchDetail(MATCH);
    expect(urls.find((u) => u.includes('/metadata'))).toContain('disable_steam=true');
  });

  it('answers null for an unknown match, and does not store it', async () => {
    const cache = recordingCache();
    const result = await almanacWith({ ...healthy, match: { status: 404, body: 'not found' } }, cache).matchDetail(MATCH);
    expect(result).toEqual({ ok: true, value: null });
    expect(cache.stored).not.toContain('test:match:116413049');
  });

  it('keeps the match when items and names fail, marking items unavailable', async () => {
    const result = await almanacWith({ ...healthy, items: { status: 500, body: 'boom' }, steam: 'network-error' }).matchDetail(MATCH);
    expect(result.ok && result.value?.players.map((p) => [p.items, p.name])).toEqual(Array.from({ length: 12 }, () => [null, null]));
  });

  it('reports a body without match_info as drift', async () => {
    const result = await almanacWith({ ...healthy, match: { status: 200, body: { status: 'weird' } } }).matchDetail(MATCH);
    expect(result).toEqual({ ok: false, error: { kind: 'drift' } });
  });
});

describe('searchPlayers', () => {
  const KASH = parseSearchQuery('Kashir') as SearchQuery;

  it('returns hits best first', async () => {
    const result = await almanacWith({ search: { status: 200, body: steamProfiles } }).searchPlayers(KASH);
    expect(result).toEqual({ ok: true, value: [{ accountId: 256939921, name: 'Kashir', matchesLast30d: steamProfiles[0]!.matches_played_last_30d }] });
  });

  it('reads a 404 as no hits', async () => {
    const result = await almanacWith({ search: { status: 404, body: { status: 404, error: 'No Steam profiles found.' } } }).searchPlayers(KASH);
    expect(result).toEqual({ ok: true, value: [] });
  });

  it('keys the cache case-insensitively and escapes the query', async () => {
    const cache = recordingCache();
    await almanacWith({ search: { status: 200, body: [] } }, cache).searchPlayers(parseSearchQuery('Kash:ir X') as SearchQuery);
    expect(cache.stored).toEqual(['test:player-search:kash%3Air%20x']);
  });
});

describe('leaderboard', () => {
  it('orders by standing, keeps ties, links only a single named account, and resolves heroes', async () => {
    const result = await almanacWith({ leaderboard: { status: 200, body: leaderboardBody }, heroes: { status: 200, body: heroes } }).leaderboard('Europe');
    if (!result.ok) throw new Error('expected a leaderboard');
    expect(result.value.map((r) => [r.position, r.accountId, r.possibleAccounts])).toEqual([
      [1, null, 7],
      [76, 1041489360, 1],
      [104, null, 0],
      [326, null, 9],
      [326, null, 2],
    ]);
    expect(result.value[1]!.heroes.map((h) => h.id)).toEqual([8, 79, 67]);
  });

  it('keeps the rows when the hero index fails', async () => {
    const result = await almanacWith({ leaderboard: { status: 200, body: leaderboardBody }, heroes: { status: 500, body: 'boom' } }).leaderboard('Europe');
    expect(result.ok && result.value[1]!.heroes.map((h) => h.kind)).toEqual(['unknown', 'unknown', 'unknown']);
  });

  it('reports an upstream failure', async () => {
    const result = await almanacWith({ leaderboard: { status: 500, body: 'boom' }, heroes: { status: 200, body: heroes } }).leaderboard('Europe');
    expect(result).toEqual({ ok: false, error: { kind: 'upstream', status: 500 } });
  });
});
