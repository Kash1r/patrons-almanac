import type { PlayerMatch, UnixSeconds } from '@almanac/api-client';

const COUNT = new Intl.NumberFormat('en-US');

export function formatCount(n: number): string {
  return COUNT.format(n);
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

export function formatUtcDate(time: UnixSeconds): string {
  return new Date(time * 1000).toISOString().slice(0, 10);
}

export function formatKda({ kills, deaths, assists }: Pick<PlayerMatch, 'kills' | 'deaths' | 'assists'>): string {
  return `${kills} / ${deaths} / ${assists}`;
}

const PERCENT = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const RATIO = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const AVERAGE = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatPercent(ratio: number): string {
  return PERCENT.format(ratio);
}

export function formatRatio(n: number): string {
  return RATIO.format(n);
}

export function formatAverage(n: number): string {
  return AVERAGE.format(n);
}

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function formatCompact(n: number): string {
  return COMPACT.format(n);
}
