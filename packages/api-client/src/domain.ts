import type { Hero, PlayerMatchHistoryEntry } from './generated/types.gen';

declare const brand: unique symbol;
type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type AccountId = Brand<number, 'AccountId'>;
export type MatchId = Brand<number, 'MatchId'>;
export type HeroId = Brand<number, 'HeroId'>;
export type UnixSeconds = Brand<number, 'UnixSeconds'>;

export type Team = 'amber' | 'sapphire';
export type MatchResult = 'win' | 'loss';

export type HeroSummary = {
  readonly kind: 'known';
  readonly id: HeroId;
  readonly name: string;
  readonly iconUrl: string | null;
};

export type HeroRef = HeroSummary | { readonly kind: 'unknown'; readonly id: HeroId };

export type HeroIndex = { readonly [heroId: string]: HeroSummary };

export type PlayerMatchRecord = {
  readonly matchId: MatchId;
  readonly startTime: UnixSeconds;
  readonly durationS: number;
  readonly heroId: HeroId;
  readonly team: Team;
  readonly result: MatchResult;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  readonly souls: number;
  readonly lastHits: number;
  readonly denies: number;
  readonly heroLevel: number;
};

export type PlayerMatch = Omit<PlayerMatchRecord, 'heroId'> & { readonly hero: HeroRef };

export type HeroSource = Pick<Hero, 'id' | 'name' | 'images'>;

export type ParsedHistory = {
  readonly matches: readonly PlayerMatchRecord[];
  readonly unreadable: number;
};

const TEAM_BY_CODE: { readonly [code: number]: Team } = { 0: 'amber', 1: 'sapphire' };

const NORMAL_GAME_MODE = 1;

const MAX_ACCOUNT_ID = 4_294_967_295;

/**
 * The result comes from the winning team, not `player_match_outcome`: the outcome is 0 (invalid)
 * on 597 of 898 measured rows, while `match_result === player_team` agreed with every scored row.
 */
export function parseHistory(rows: readonly PlayerMatchHistoryEntry[]): ParsedHistory {
  const matches: PlayerMatchRecord[] = [];
  let unreadable = 0;
  for (const row of rows) {
    if (row.game_mode !== NORMAL_GAME_MODE) continue;
    const team = TEAM_BY_CODE[row.player_team];
    const winner = TEAM_BY_CODE[row.match_result];
    if (team === undefined || winner === undefined) {
      unreadable += 1;
      continue;
    }
    matches.push({
      matchId: mintMatchId(row.match_id),
      startTime: mintUnixSeconds(row.start_time),
      durationS: row.match_duration_s,
      heroId: mintHeroId(row.hero_id),
      team,
      result: team === winner ? 'win' : 'loss',
      kills: row.player_kills,
      deaths: row.player_deaths,
      assists: row.player_assists,
      souls: row.net_worth,
      lastHits: row.last_hits,
      denies: row.denies,
      heroLevel: row.hero_level,
    });
  }
  matches.sort((a, b) => b.startTime - a.startTime);
  return { matches, unreadable };
}

export function toHeroIndex(heroes: readonly HeroSource[]): HeroIndex {
  const index: { [heroId: string]: HeroSummary } = {};
  for (const hero of heroes) {
    index[String(hero.id)] = {
      kind: 'known',
      id: mintHeroId(hero.id),
      name: hero.name,
      iconUrl: hero.images.icon_image_small_webp ?? hero.images.icon_image_small ?? null,
    };
  }
  return index;
}

export function resolveHero(index: HeroIndex, id: HeroId): HeroRef {
  return index[String(id)] ?? { kind: 'unknown', id };
}

export function joinHeroes(records: readonly PlayerMatchRecord[], index: HeroIndex): PlayerMatch[] {
  return records.map(({ heroId, ...rest }) => ({ ...rest, hero: resolveHero(index, heroId) }));
}

/** Accepts canonical decimal SteamID3 only: no sign, no leading zero, 1 to 2^32-1. */
export function parseAccountId(input: string): AccountId | null {
  if (!/^[1-9][0-9]{0,9}$/.test(input)) return null;
  const n = Number(input);
  return n <= MAX_ACCOUNT_ID ? mintAccountId(n) : null;
}

const mintAccountId = (n: number) => n as AccountId;
const mintMatchId = (n: number) => n as MatchId;
const mintHeroId = (n: number) => n as HeroId;
const mintUnixSeconds = (n: number) => n as UnixSeconds;
