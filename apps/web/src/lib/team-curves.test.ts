import { expect, it } from 'vitest';
import type { MatchPlayer } from '@almanac/api-client';
import { teamCurves } from './team-curves';

const player = (team: MatchPlayer['team'], curve: [number, number, number][]): Pick<MatchPlayer, 'team' | 'curve'> =>
  ({ team, curve: curve.map(([atS, souls, heroDamage]) => ({ atS, souls, heroDamage })) });

it('sums each team at the shared sample times, starting from zero', () => {
  const curves = teamCurves([
    player('amber', [[180, 1000, 50], [360, 3000, 400]]),
    player('amber', [[180, 1200, 70], [360, 2500, 300]]),
    player('sapphire', [[180, 900, 20], [360, 2800, 500]]),
  ]);
  expect(curves.souls).toEqual([
    { atS: 0, amber: 0, sapphire: 0 },
    { atS: 180, amber: 2200, sapphire: 900 },
    { atS: 360, amber: 5500, sapphire: 2800 },
  ]);
  expect(curves.heroDamage.at(-1)).toEqual({ atS: 360, amber: 700, sapphire: 500 });
});

it('drops a time some player did not report', () => {
  const curves = teamCurves([player('amber', [[180, 1, 1], [360, 2, 2]]), player('sapphire', [[360, 3, 3]])]);
  expect(curves.souls.map((p) => p.atS)).toEqual([0, 360]);
});

it('is empty with no samples', () => {
  expect(teamCurves([player('amber', [])])).toEqual({ souls: [], heroDamage: [] });
});
