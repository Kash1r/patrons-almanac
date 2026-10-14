import { describe, expect, it } from 'vitest';
import type { HeroId, HeroRef, MatchId, PlayerMatch, UnixSeconds } from '@almanac/api-client';
import { isLowSample, kdaRatio, tally, topHeroes, winRate } from './record';

const hero = (id: number): HeroRef => ({ kind: 'unknown', id: id as HeroId });

const match = (heroId: number, result: PlayerMatch['result'], kills = 0, deaths = 0, assists = 0): PlayerMatch => ({
  matchId: 1 as MatchId, startTime: 0 as UnixSeconds, durationS: 1800, hero: hero(heroId), team: 'amber', result, mode: 'ranked',
  kills, deaths, assists, souls: 0, lastHits: 0, denies: 0, heroLevel: 1,
});

describe('tally', () => {
  it('sums matches, wins and K/D/A', () => {
    expect(tally([match(1, 'win', 9, 4, 7), match(2, 'loss', 1, 6, 3)])).toEqual({ matches: 2, wins: 1, kills: 10, deaths: 10, assists: 10 });
  });

  it('is all zeros for no matches', () => {
    expect(tally([])).toEqual({ matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0 });
  });
});

describe('topHeroes', () => {
  it('orders by matches, then wins, then hero id, and keeps the first count', () => {
    const matches = [match(3, 'loss'), match(3, 'loss'), match(2, 'win'), match(1, 'loss'), match(2, 'loss'), match(4, 'win')];
    expect(topHeroes(matches, 3).map((h) => [h.hero.id, h.matches, h.wins])).toEqual([[2, 2, 1], [3, 2, 0], [4, 1, 1]]);
  });
});

describe('rates', () => {
  it('divides wins by matches and is 0 with no matches', () => {
    expect(winRate({ matches: 4, wins: 3 })).toBe(0.75);
    expect(winRate({ matches: 0, wins: 0 })).toBe(0);
  });

  it('divides kills plus assists by deaths, treating 0 deaths as 1', () => {
    expect(kdaRatio({ kills: 9, deaths: 4, assists: 7 })).toBe(4);
    expect(kdaRatio({ kills: 3, deaths: 0, assists: 2 })).toBe(5);
  });

  it('marks fewer than 50 matches as low sample', () => {
    expect(isLowSample(49)).toBe(true);
    expect(isLowSample(50)).toBe(false);
  });
});
