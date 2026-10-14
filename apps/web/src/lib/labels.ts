import type { MatchResult, Team } from '@almanac/api-client';

export const RESULT_LABEL = {
  win: { word: 'Win', className: 'text-win' },
  loss: { word: 'Loss', className: 'text-loss' },
} as const satisfies Record<MatchResult, { word: string; className: string }>;

export const TEAM_LABEL = {
  amber: { name: 'The Amber Hand', className: 'text-team-amber', stroke: 'var(--color-team-amber)' },
  sapphire: { name: 'The Sapphire Flame', className: 'text-team-sapphire', stroke: 'var(--color-team-sapphire)' },
} as const satisfies Record<Team, { name: string; className: string; stroke: string }>;

export const TEAMS = ['amber', 'sapphire'] as const satisfies readonly Team[];
