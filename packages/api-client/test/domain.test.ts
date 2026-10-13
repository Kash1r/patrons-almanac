import { describe, expect, it } from 'vitest';
import type { PlayerMatchHistoryEntry } from '../src/generated/types.gen';
import { type HeroId, joinHeroes, parseAccountId, parseHistory, toHeroIndex } from '../src/domain';

const REAL_ROW: PlayerMatchHistoryEntry = {
  account_id: 256939921, match_id: 115738165, hero_id: 65, hero_level: 32, start_time: 1791853191,
  game_mode: 1, match_mode: 4, player_team: 0, player_kills: 9, player_deaths: 4, player_assists: 7,
  denies: 4, net_worth: 37103, last_hits: 186, match_duration_s: 1876, match_result: 0,
  objectives_mask_team0: 61253, objectives_mask_team1: 8260, player_match_outcome: 1,
};
const row = (overrides: Partial<PlayerMatchHistoryEntry>): PlayerMatchHistoryEntry => ({ ...REAL_ROW, ...overrides });

describe('parseHistory', () => {
  it('maps a real row to a record', () => {
    expect(parseHistory([REAL_ROW])).toEqual({
      matches: [{
        matchId: 115738165, startTime: 1791853191, durationS: 1876, heroId: 65, team: 'amber', result: 'win',
        kills: 9, deaths: 4, assists: 7, souls: 37103, lastHits: 186, denies: 4, heroLevel: 32,
      }],
      unreadable: 0,
    });
  });

  it('derives the result from the winning team when the outcome code is 0', () => {
    const { matches } = parseHistory([
      row({ match_id: 1, player_match_outcome: 0, player_team: 1, match_result: 1 }),
      row({ match_id: 2, player_match_outcome: 0, player_team: 1, match_result: 0 }),
    ]);
    expect(matches.map((m) => [m.matchId, m.team, m.result])).toEqual([[1, 'sapphire', 'win'], [2, 'sapphire', 'loss']]);
  });

  it('drops non-normal modes and counts unknown team codes', () => {
    const parsed = parseHistory([row({ match_id: 1, game_mode: 4 }), row({ match_id: 2, player_team: 2 })]);
    expect(parsed).toEqual({ matches: [], unreadable: 1 });
  });

  it('returns newest first whatever the input order', () => {
    const { matches } = parseHistory([row({ match_id: 1, start_time: 100 }), row({ match_id: 2, start_time: 200 })]);
    expect(matches.map((m) => m.matchId)).toEqual([2, 1]);
  });
});

describe('heroes', () => {
  const index = toHeroIndex([
    { id: 1, name: 'Infernus', images: { icon_image_small_webp: 'https://a/inferno_sm.webp', icon_image_small: 'https://a/inferno_sm.png' } },
    { id: 2, name: 'Seven', images: { icon_image_small: 'https://a/gigawatt_sm.png' } },
    { id: 83, name: 'hero_testhero', images: {} },
  ]);

  it('indexes every hero, preferring the webp icon, then the png, then none', () => {
    expect(index).toEqual({
      '1': { kind: 'known', id: 1, name: 'Infernus', iconUrl: 'https://a/inferno_sm.webp' },
      '2': { kind: 'known', id: 2, name: 'Seven', iconUrl: 'https://a/gigawatt_sm.png' },
      '83': { kind: 'known', id: 83, name: 'hero_testhero', iconUrl: null },
    });
  });

  it('resolves a known hero and marks a missing one as unknown', () => {
    const { matches } = parseHistory([row({ match_id: 1, hero_id: 1 }), row({ match_id: 2, hero_id: 999 })]);
    expect(joinHeroes(matches, index).map((m) => m.hero)).toEqual([
      { kind: 'known', id: 1, name: 'Infernus', iconUrl: 'https://a/inferno_sm.webp' },
      { kind: 'unknown', id: 999 as HeroId },
    ]);
  });
});

describe('parseAccountId', () => {
  it.each([
    ['256939921', 256939921],
    ['1', 1],
    ['2147483648', 2147483648],
    ['4294967295', 4294967295],
    ['4294967296', null],
    ['0', null],
    ['01', null],
    ['abc', null],
    ['-1', null],
    ['1.5', null],
    ['1e5', null],
    ['', null],
  ])('%j -> %j', (input, expected) => {
    expect(parseAccountId(input)).toBe(expected);
  });
});
