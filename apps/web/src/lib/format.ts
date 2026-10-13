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
