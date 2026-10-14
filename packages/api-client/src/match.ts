import { z } from 'zod';
import type { Item, ItemSlotType, Upgrade } from './generated/types.gen';
import {
  type AccountId,
  type HeroId,
  type HeroIndex,
  type HeroRef,
  type MatchId,
  type Team,
  type UnixSeconds,
  resolveHero,
} from './domain';

/**
 * The spec gives `/v1/matches/{match_id}/metadata` no response schema (it names the protobuf
 * `CMsgMatchMetaDataContents`), so this validates the fields the match page reads and drops the rest.
 * Field names and types measured on match 116413049 (2026-10-13).
 */
export const zMatchMetadata = z.object({
  match_info: z.object({
    match_id: z.int().positive(),
    start_time: z.int().nonnegative(),
    duration_s: z.int().nonnegative(),
    winning_team: z.int(),
    players: z.array(
      z.object({
        account_id: z.int().nonnegative(),
        player_slot: z.int(),
        team: z.int(),
        hero_id: z.int(),
        kills: z.int(),
        deaths: z.int(),
        assists: z.int(),
        net_worth: z.int(),
        last_hits: z.int(),
        denies: z.int(),
        level: z.int(),
        items: z.array(z.object({ game_time_s: z.int(), item_id: z.int(), sold_time_s: z.int().nullish() })),
        stats: z.array(z.object({ time_stamp_s: z.int(), net_worth: z.int(), player_damage: z.int() })),
      }),
    ),
  }),
});

export type MatchMetadata = z.infer<typeof zMatchMetadata>;

export type ItemSummary = {
  readonly id: number;
  readonly name: string;
  readonly iconUrl: string | null;
  readonly slot: ItemSlotType;
  readonly tier: number;
};

/** Shop upgrades only. Ability and weapon ids also appear in a player's item list. */
export type ItemIndex = { readonly [itemId: string]: ItemSummary };

export type ItemPurchase = {
  readonly item: ItemSummary;
  readonly boughtAtS: number;
  readonly soldAtS: number | null;
};

export type CurvePoint = { readonly atS: number; readonly souls: number; readonly heroDamage: number };

type PlayerTotals = {
  readonly accountId: AccountId;
  readonly slot: number;
  readonly team: Team;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  readonly souls: number;
  readonly lastHits: number;
  readonly denies: number;
  readonly level: number;
  readonly heroDamage: number;
  readonly curve: readonly CurvePoint[];
};

/** What the cache holds for a finished match: no names, no item art, so it never goes stale. */
export type MatchPlayerRecord = PlayerTotals & {
  readonly heroId: HeroId;
  readonly itemEvents: readonly { readonly itemId: number; readonly atS: number; readonly soldAtS: number | null }[];
};

export type MatchRecord = {
  readonly matchId: MatchId;
  readonly startTime: UnixSeconds;
  readonly durationS: number;
  readonly winner: Team;
  readonly players: readonly MatchPlayerRecord[];
};

export type MatchPlayer = PlayerTotals & {
  readonly hero: HeroRef;
  /** `null` when the API holds no Steam profile for the account. */
  readonly name: string | null;
  /** Shop purchases in buying order; `null` when the item index failed. */
  readonly items: readonly ItemPurchase[] | null;
};

export type MatchDetail = Omit<MatchRecord, 'players'> & { readonly players: readonly MatchPlayer[] };

const TEAM_BY_CODE: { readonly [code: number]: Team } = { 0: 'amber', 1: 'sapphire' };

const MAX_MATCH_ID = Number.MAX_SAFE_INTEGER;

/** Accepts canonical decimal ids only: no sign, no leading zero. */
export function parseMatchId(input: string): MatchId | null {
  if (!/^[1-9][0-9]{0,15}$/.test(input)) return null;
  const n = Number(input);
  return n <= MAX_MATCH_ID ? (n as MatchId) : null;
}

/** Returns `null` when a team code is outside 0 and 1, which the page cannot draw. */
export function toMatchRecord(metadata: MatchMetadata): MatchRecord | null {
  const info = metadata.match_info;
  const winner = TEAM_BY_CODE[info.winning_team];
  if (winner === undefined) return null;
  const players: MatchPlayerRecord[] = [];
  for (const p of info.players) {
    const team = TEAM_BY_CODE[p.team];
    if (team === undefined) return null;
    const curve = p.stats
      .map((s) => ({ atS: s.time_stamp_s, souls: s.net_worth, heroDamage: s.player_damage }))
      .sort((a, b) => a.atS - b.atS);
    players.push({
      accountId: p.account_id as AccountId,
      slot: p.player_slot,
      team,
      heroId: p.hero_id as HeroId,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      souls: p.net_worth,
      lastHits: p.last_hits,
      denies: p.denies,
      level: p.level,
      heroDamage: curve.at(-1)?.heroDamage ?? 0,
      curve,
      itemEvents: p.items
        .map((i) => ({ itemId: i.item_id, atS: i.game_time_s, soldAtS: i.sold_time_s ? i.sold_time_s : null }))
        .sort((a, b) => a.atS - b.atS),
    });
  }
  players.sort((a, b) => a.slot - b.slot);
  return {
    matchId: info.match_id as MatchId,
    startTime: info.start_time as UnixSeconds,
    durationS: info.duration_s,
    winner,
    players,
  };
}

export function toItemIndex(items: readonly Item[]): ItemIndex {
  const index: { [itemId: string]: ItemSummary } = {};
  for (const item of items) {
    if (!isUpgrade(item)) continue;
    index[String(item.id)] = {
      id: item.id,
      name: item.name,
      iconUrl: item.shop_image_small_webp ?? item.shop_image_webp ?? item.image_webp ?? item.image ?? null,
      slot: item.item_slot_type,
      tier: item.item_tier,
    };
  }
  return index;
}

export function joinMatch(
  record: MatchRecord,
  heroes: HeroIndex,
  items: ItemIndex | null,
  names: { readonly [accountId: string]: string },
): MatchDetail {
  return {
    ...record,
    players: record.players.map(({ heroId, itemEvents, ...rest }) => ({
      ...rest,
      hero: resolveHero(heroes, heroId),
      name: names[String(rest.accountId)] ?? null,
      items:
        items === null
          ? null
          : itemEvents.flatMap((e) => {
              const item = items[String(e.itemId)];
              return item === undefined ? [] : [{ item, boughtAtS: e.atS, soldAtS: e.soldAtS }];
            }),
    })),
  };
}

/** Each variant types `type` as the whole `ItemType` enum, so the union does not narrow on it. */
function isUpgrade(item: Item): item is Upgrade {
  return item.type === 'upgrade';
}
