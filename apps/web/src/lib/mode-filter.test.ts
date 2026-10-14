import { expect, it } from 'vitest';
import type { PlayerMatch } from '@almanac/api-client';
import { filterByMode, parseModeFilter } from './mode-filter';

const match = (id: number, mode: PlayerMatch['mode']) => ({ matchId: id, mode }) as PlayerMatch;

it.each([
  ['ranked', 'ranked'],
  ['unranked', 'unranked'],
  ['all', 'all'],
  ['Ranked', 'all'],
  ['other', 'all'],
  [undefined, 'all'],
  [['ranked'], 'all'],
])('parses %j as %j', (input, expected) => expect(parseModeFilter(input)).toBe(expected));

it('keeps only the chosen mode, and everything for all', () => {
  const matches = [match(1, 'ranked'), match(2, 'unranked'), match(3, 'other')];
  expect(filterByMode(matches, 'ranked').map((m) => m.matchId)).toEqual([1]);
  expect(filterByMode(matches, 'unranked').map((m) => m.matchId)).toEqual([2]);
  expect(filterByMode(matches, 'all')).toBe(matches);
});
