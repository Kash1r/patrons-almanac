import type { Hero, PlayerMatchHistoryEntry, Rank, RankResponse, SteamProfile } from './generated/types.gen';

declare const brand: unique symbol;
type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type AccountId = Brand<number, 'AccountId'>;
export type MatchId = Brand<number, 'MatchId'>;
export type HeroId = Brand<number, 'HeroId'>;
export type UnixSeconds = Brand<number, 'UnixSeconds'>;

export type Team = 'amber' | 'sapphire';
export type MatchResult = 'win' | 'loss';

/** Private lobbies, bot games and the rest are `other`; they count only toward "all". */
export type MatchMode = 'ranked' | 'unranked' | 'other';

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
  readonly mode: MatchMode;
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

export type RankTier = {
  readonly name: string;
  /** Badge art by subrank, `'1'` to `'6'`. Obscurus has none. */
  readonly badgeUrls: { readonly [subrank: string]: string };
};

export type RankIndex = { readonly [tier: string]: RankTier };

export type RankSource = Pick<Rank, 'tier' | 'name' | 'images'>;

export type PlayerRank =
  | { readonly kind: 'unranked' }
  | {
      readonly kind: 'ranked';
      readonly tier: number;
      readonly subrank: number;
      /** `null` when the rank index failed or lacks the tier. */
      readonly name: string | null;
      readonly badgeUrl: string | null;
      /** Start of the ranked match the rank was read from. */
      readonly asOf: UnixSeconds | null;
    };

export type SteamPersona = { readonly name: string };

export type PlayerHit = {
  readonly accountId: AccountId;
  readonly name: string;
  readonly matchesLast30d: number;
};

/** Trimmed, inner whitespace collapsed; `null` when nothing is left. */
export type SearchQuery = Brand<string, 'SearchQuery'>;

export type ParsedHistory = {
  readonly matches: readonly PlayerMatchRecord[];
  readonly unreadable: number;
};

const TEAM_BY_CODE: { readonly [code: number]: Team } = { 0: 'amber', 1: 'sapphire' };

const NORMAL_GAME_MODE = 1;

/**
 * The spec types `match_mode` as a bare integer; the codes follow its `ActiveMatchMode` enum order.
 * Measured on account 256939921: every code-4 row carries `ranked_delta` and none of the code-1 rows
 * do, and the API's own `match_mode=ranked` and `unranked` filters return only code-4 and code-1 rows.
 */
const MODE_BY_CODE: { readonly [code: number]: MatchMode } = { 1: 'unranked', 4: 'ranked' };

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
      mode: MODE_BY_CODE[row.match_mode] ?? 'other',
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

const SUBRANKS = ['1', '2', '3', '4', '5', '6'] as const;

export function toRankIndex(ranks: readonly RankSource[]): RankIndex {
  const index: { [tier: string]: RankTier } = {};
  for (const rank of ranks) {
    const badgeUrls: { [subrank: string]: string } = {};
    for (const sub of SUBRANKS) {
      const url = rank.images[`small_subrank${sub}_webp`] ?? rank.images[`small_subrank${sub}`];
      if (url !== null && url !== undefined) badgeUrls[sub] = url;
    }
    index[String(rank.tier)] = { name: rank.name, badgeUrls };
  }
  return index;
}

/** Tier 0 is Obscurus, which the API also reports while the player has no ranked result. */
export function resolveRank(index: RankIndex, response: RankResponse): PlayerRank {
  if (response.rank === 0) return { kind: 'unranked' };
  const tier = index[String(response.rank)];
  return {
    kind: 'ranked',
    tier: response.rank,
    subrank: response.subrank,
    name: tier?.name ?? null,
    badgeUrl: tier?.badgeUrls[String(response.subrank)] ?? null,
    asOf: response.last_match === null || response.last_match === undefined ? null : mintUnixSeconds(response.last_match.start_time),
  };
}

export function toSteamPersona(profiles: readonly Pick<SteamProfile, 'personaname'>[]): SteamPersona | null {
  const profile = profiles[0];
  return profile === undefined ? null : { name: profile.personaname };
}

export function toPlayerHits(
  profiles: readonly Pick<SteamProfile, 'account_id' | 'personaname' | 'matches_played_last_30d'>[],
): PlayerHit[] {
  return profiles.map((p) => ({ accountId: mintAccountId(p.account_id), name: p.personaname, matchesLast30d: p.matches_played_last_30d }));
}

export const MAX_SEARCH_LENGTH = 64;

export function parseSearchQuery(input: string): SearchQuery | null {
  const query = input.trim().replace(/\s+/g, ' ').slice(0, MAX_SEARCH_LENGTH).trim();
  return query === '' ? null : (query as SearchQuery);
}

const STEAM_ID64_BASE = 76561197960265728n;
const STEAM_ID64 = /^7656119\d{10}$/;
const STEAM_PROFILE_URL = /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/profiles\/(7656119\d{10})\/?$/;

/**
 * The account a query names outright: a SteamID3, a SteamID64, or a steamcommunity.com/profiles/ URL.
 * Search hides accounts with few recent matches, so these skip it.
 */
export function accountIdFromQuery(query: SearchQuery): AccountId | null {
  const id64 = STEAM_PROFILE_URL.exec(query)?.[1] ?? STEAM_ID64.exec(query)?.[0];
  if (id64 !== undefined) return parseAccountId(String(BigInt(id64) - STEAM_ID64_BASE));
  return parseAccountId(query);
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
