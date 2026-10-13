import { expect, it } from 'vitest';
import type { UnixSeconds } from '@almanac/api-client';
import { formatCount, formatUtcDate, formatDuration, formatKda } from './format';

it('formats counts with grouping', () => {
  expect(formatCount(37103)).toBe('37,103');
  expect(formatCount(186)).toBe('186');
});
it('formats durations under and over an hour', () => {
  expect(formatDuration(1876)).toBe('31:16');
  expect(formatDuration(65)).toBe('1:05');
  expect(formatDuration(3725)).toBe('1:02:05');
});
it('formats start times as UTC ISO dates', () => expect(formatUtcDate(1791853191 as UnixSeconds)).toBe('2026-10-13'));
it('formats KDA with spaced slashes', () => expect(formatKda({ kills: 9, deaths: 4, assists: 7 })).toBe('9 / 4 / 7'));
