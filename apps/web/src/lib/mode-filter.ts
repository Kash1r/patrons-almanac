import type { MatchMode, PlayerMatch } from '@almanac/api-client';

export const MODE_FILTERS = ['all', 'ranked', 'unranked'] as const;

export type ModeFilter = (typeof MODE_FILTERS)[number];

/** The word that names a filter's matches in copy: "883 normal-mode matches", "266 ranked matches". */
export const MODE_SCOPE = { all: 'normal-mode', ranked: 'ranked', unranked: 'unranked' } as const satisfies Record<ModeFilter, string>;

export const MODE_LABEL = { ranked: 'Ranked', unranked: 'Unranked', other: 'Other' } as const satisfies Record<MatchMode, string>;

/** Anything but `ranked` or `unranked` reads as `all`, so a stale or mistyped link still shows the profile. */
export function parseModeFilter(input: unknown): ModeFilter {
  return input === 'ranked' || input === 'unranked' ? input : 'all';
}

export function filterByMode(matches: readonly PlayerMatch[], filter: ModeFilter): readonly PlayerMatch[] {
  return filter === 'all' ? matches : matches.filter((m) => m.mode === filter);
}
