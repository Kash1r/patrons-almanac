import { describe, expect, it } from 'vitest';
import { createAlmanac, noCache } from '../src/almanac';
import { type AccountId, parseAccountId } from '../src/domain';

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

  it('answers an unknown account with an empty history', async () => {
    const almanac = createAlmanac({ cache: noCache, cacheNamespace: 'live' });
    expect(await almanac.matchHistory(parseAccountId('4294967295') as AccountId)).toEqual({ ok: true, value: [] });
  }, 30_000);
});
