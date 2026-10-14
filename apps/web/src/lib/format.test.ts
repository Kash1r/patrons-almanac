import { expect, it } from 'vitest';
import type { UnixSeconds } from '@almanac/api-client';
import { formatAverage, formatCount, formatDuration, formatKda, formatPercent, formatRatio, formatUtcDate } from './format';

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
it('formats rates to one decimal place', () => {
  expect(formatPercent(482 / 883)).toBe('54.6%');
  expect(formatPercent(1)).toBe('100.0%');
});
it('formats ratios to two decimals and averages to one', () => {
  expect(formatRatio(16381 / 3909)).toBe('4.19');
  expect(formatAverage(5552 / 883)).toBe('6.3');
});
