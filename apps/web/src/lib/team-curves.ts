import type { MatchPlayer, Team } from '@almanac/api-client';

export type TeamPoint = { readonly atS: number; readonly amber: number; readonly sapphire: number };

export type TeamCurves = { readonly souls: readonly TeamPoint[]; readonly heroDamage: readonly TeamPoint[] };

/**
 * Team totals at each sample time every player reported. Players share the API's sample times
 * (every 180 s, then 300 s, then the final second), so in practice no time is dropped.
 */
export function teamCurves(players: readonly Pick<MatchPlayer, 'team' | 'curve'>[]): TeamCurves {
  const times = players
    .map((p) => new Set(p.curve.map((c) => c.atS)))
    .reduce<Set<number> | null>((shared, mine) => (shared === null ? mine : new Set([...shared].filter((t) => mine.has(t)))), null);
  const sorted = [...(times ?? [])].sort((a, b) => a - b);
  const total = (team: Team, atS: number, pick: 'souls' | 'heroDamage') =>
    players
      .filter((p) => p.team === team)
      .reduce((sum, p) => sum + (p.curve.find((c) => c.atS === atS)?.[pick] ?? 0), 0);
  const series = (pick: 'souls' | 'heroDamage') =>
    [{ atS: 0, amber: 0, sapphire: 0 }, ...sorted.map((atS) => ({ atS, amber: total('amber', atS, pick), sapphire: total('sapphire', atS, pick) }))];
  return sorted.length === 0 ? { souls: [], heroDamage: [] } : { souls: series('souls'), heroDamage: series('heroDamage') };
}
