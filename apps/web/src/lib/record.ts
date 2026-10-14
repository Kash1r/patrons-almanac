import type { HeroRef, PlayerMatch } from '@almanac/api-client';

/** Rates over fewer matches than this are shown muted, marked "low sample". */
export const LOW_SAMPLE_MATCHES = 50;

export type Tally = {
  readonly matches: number;
  readonly wins: number;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
};

export type HeroTally = Tally & { readonly hero: HeroRef };

const EMPTY: Tally = { matches: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };

function add(t: Tally, m: PlayerMatch): Tally {
  return {
    matches: t.matches + 1,
    wins: t.wins + (m.result === 'win' ? 1 : 0),
    kills: t.kills + m.kills,
    deaths: t.deaths + m.deaths,
    assists: t.assists + m.assists,
  };
}

export function tally(matches: readonly PlayerMatch[]): Tally {
  return matches.reduce(add, EMPTY);
}

/** Most played first; ties go to more wins, then the lower hero id, so the order is stable. */
export function topHeroes(matches: readonly PlayerMatch[], count: number): HeroTally[] {
  const byHero = new Map<number, HeroTally>();
  for (const m of matches) {
    const current = byHero.get(m.hero.id) ?? { ...EMPTY, hero: m.hero };
    byHero.set(m.hero.id, { ...add(current, m), hero: current.hero });
  }
  return [...byHero.values()]
    .sort((a, b) => b.matches - a.matches || b.wins - a.wins || a.hero.id - b.hero.id)
    .slice(0, count);
}

export function winRate(t: Pick<Tally, 'matches' | 'wins'>): number {
  return t.matches === 0 ? 0 : t.wins / t.matches;
}

/** (kills + assists) / deaths, with deathless records divided by 1. */
export function kdaRatio(t: Pick<Tally, 'kills' | 'deaths' | 'assists'>): number {
  return (t.kills + t.assists) / Math.max(t.deaths, 1);
}

export function isLowSample(matches: number): boolean {
  return matches < LOW_SAMPLE_MATCHES;
}
