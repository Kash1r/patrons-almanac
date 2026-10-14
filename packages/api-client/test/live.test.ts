import { describe, expect, it } from 'vitest';
import { createAlmanac, noCache } from '../src/almanac';
import { type AccountId, type MatchId, type SearchQuery, parseAccountId, parseSearchQuery } from '../src/domain';
import { parseMatchId } from '../src/match';

describe.runIf(process.env.ALMANAC_LIVE === '1')('live deadlock-api.com', () => {
  it('parses the demo account end to end', async () => {
    const almanac = createAlmanac({ cache: noCache, cacheNamespace: 'live' });
    const result = await almanac.matchHistory(parseAccountId('256939921') as AccountId);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.length).toBeGreaterThanOrEqual(880);
    expect(result.ok && result.value.filter((m) => m.hero.kind === 'unknown')).toEqual([]);
  }, 30_000);

  it('reads the demo account rank and persona', async () => {
    const almanac = createAlmanac({ cache: noCache, cacheNamespace: 'live' });
    const me = parseAccountId('256939921') as AccountId;
    const [rank, persona] = await Promise.all([almanac.playerRank(me), almanac.steamPersona(me)]);
    expect(rank.ok && rank.value.kind === 'ranked' && rank.value.name).toEqual(expect.any(String));
    expect(persona).toEqual({ ok: true, value: { name: expect.any(String) } });
  }, 30_000);

  it('reads a demo match with every hero, item list and curve', async () => {
    const almanac = createAlmanac({ cache: noCache, cacheNamespace: 'live' });
    const result = await almanac.matchDetail(parseMatchId('116413049') as MatchId);
    if (!result.ok || result.value === null) throw new Error(`expected a match, got ${JSON.stringify(result)}`);
    expect(result.value.players).toHaveLength(12);
    for (const p of result.value.players) {
      expect(p.hero.kind).toBe('known');
      expect(p.items?.length).toBeGreaterThan(0);
      expect(p.curve.length).toBeGreaterThan(2);
    }
    expect(await almanac.matchDetail(parseMatchId('999999999') as MatchId)).toEqual({ ok: true, value: null });
  }, 30_000);

  it('finds the demo account by name', async () => {
    const almanac = createAlmanac({ cache: noCache, cacheNamespace: 'live' });
    const result = await almanac.searchPlayers(parseSearchQuery('Kashir') as SearchQuery);
    expect(result.ok && result.value.map((h) => h.accountId)).toContain(256939921);
  }, 30_000);

  it('answers an unknown account with an empty history', async () => {
    const almanac = createAlmanac({ cache: noCache, cacheNamespace: 'live' });
    expect(await almanac.matchHistory(parseAccountId('4294967295') as AccountId)).toEqual({ ok: true, value: [] });
  }, 30_000);
});
