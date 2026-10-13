import { describe, expect, it } from 'vitest';
import heroes from './fixtures/heroes.json';
import history from './fixtures/match-history.json';
import { type CacheStore, createAlmanac, noCache } from '../src/almanac';
import { type AccountId, parseAccountId } from '../src/domain';

const ME = parseAccountId('256939921') as AccountId;

type Reply = { status: number; body: unknown } | 'network-error';

const ROUTES = {
  '/v1/players/256939921/match-history': 'history',
  '/v1/assets/heroes': 'heroes',
} as const;

function upstream(replies: { history: Reply; heroes: Reply }): typeof fetch {
  return async (input) => {
    const { pathname } = new URL(input instanceof Request ? input.url : input);
    if (!(pathname in ROUTES)) throw new Error(`unexpected upstream path ${pathname}`);
    const reply = replies[ROUTES[pathname as keyof typeof ROUTES]];
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

const almanacWith = (replies: { history: Reply; heroes: Reply }, cache: CacheStore = noCache) =>
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
