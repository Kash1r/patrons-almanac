import type { LeaderboardData, LeaderboardEntry } from './generated/types.gen';
import { type AccountId, type HeroId, type HeroIndex, type HeroRef, parseAccountId, resolveHero } from './domain';

export type Region = LeaderboardData['path']['region'];

export const REGIONS = ['Europe', 'Asia', 'NAmerica', 'SAmerica', 'Oceania'] as const satisfies readonly Region[];

/**
 * The spec calls `rank` a badge; live it is the standing, 1 to 1000, ascending, with ties sharing a
 * number (Europe had 9 on 2026-10-13). Asia, SAmerica and Oceania list fewer than 1000 players.
 */
export type LeaderboardRecord = {
  readonly position: number;
  readonly name: string | null;
  /** The account, when the API names exactly one. Names are not unique, so it may list several. */
  readonly accountId: AccountId | null;
  readonly possibleAccounts: number;
  readonly heroIds: readonly HeroId[];
};

export type LeaderboardRow = Omit<LeaderboardRecord, 'heroIds'> & { readonly heroes: readonly HeroRef[] };

export function parseRegion(input: string): Region | null {
  return REGIONS.find((r) => r === input) ?? null;
}

export function toLeaderboard(entries: readonly LeaderboardEntry[]): LeaderboardRecord[] {
  const rows: LeaderboardRecord[] = [];
  for (const e of entries) {
    if (e.rank === null || e.rank === undefined) continue;
    const ids = e.possible_account_ids ?? [];
    rows.push({
      position: e.rank,
      name: e.account_name ?? null,
      accountId: ids.length === 1 && ids[0] !== undefined ? parseAccountId(String(ids[0])) : null,
      possibleAccounts: ids.length,
      heroIds: (e.top_hero_ids ?? []).map((id) => id as HeroId),
    });
  }
  return rows.sort((a, b) => a.position - b.position);
}

export function joinLeaderboard(records: readonly LeaderboardRecord[], heroes: HeroIndex): LeaderboardRow[] {
  return records.map(({ heroIds, ...rest }) => ({ ...rest, heroes: heroIds.map((id) => resolveHero(heroes, id)) }));
}
