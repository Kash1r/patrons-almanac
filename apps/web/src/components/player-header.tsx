import type { AccountId, PlayerRank, Result, SteamPersona } from '@almanac/api-client';
import { ApiArt } from '@/components/api-art';
import { formatUtcDate } from '@/lib/format';

export interface PlayerHeaderProps {
  readonly accountId: AccountId;
  readonly persona: Result<SteamPersona | null>;
  readonly rank: Result<PlayerRank>;
}

/** A missing or failed persona falls back to the account id as the title. */
export function PlayerHeader({ accountId, persona, rank }: PlayerHeaderProps) {
  const name = persona.ok ? persona.value?.name : undefined;
  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {name === undefined ? (
          <h1 className="type-display-xl text-gilt">
            Account <span className="type-stat-xl">{accountId}</span>
          </h1>
        ) : (
          <>
            <h1 className="type-display-xl break-words text-gilt">{name}</h1>
            <p className="mt-2 type-body text-text-muted">
              Account <span className="type-table">{accountId}</span>
            </p>
          </>
        )}
      </div>
      <RankBlock rank={rank} />
    </header>
  );
}

function RankBlock({ rank }: { rank: Result<PlayerRank> }) {
  const badgeUrl = rank.ok && rank.value.kind === 'ranked' ? rank.value.badgeUrl : null;
  return (
    <section aria-label="Rank" className="flex items-center gap-4 border border-hairline bg-surface p-4 corner-step-sm">
      {badgeUrl === null ? (
        <span className="size-12 shrink-0 rounded-full border border-hairline" aria-hidden="true" />
      ) : (
        <ApiArt src={badgeUrl} className="size-12 shrink-0" />
      )}
      <div>
        <p className="type-label uppercase text-text-muted">Rank</p>
        <RankText rank={rank} />
      </div>
    </section>
  );
}

function RankText({ rank }: { rank: Result<PlayerRank> }) {
  if (!rank.ok) {
    return (
      <>
        <p className="type-h3">Unavailable</p>
        <p className="type-body-small text-text-muted">deadlock-api.com did not return a rank.</p>
      </>
    );
  }
  if (rank.value.kind === 'unranked') {
    return (
      <>
        <p className="type-h3">Unranked</p>
        <p className="type-body-small text-text-muted">No ranked result reported yet.</p>
      </>
    );
  }
  const { name, tier, subrank, asOf } = rank.value;
  return (
    <>
      <p className="type-h3">
        {name ?? 'Tier'} <span className="type-stat">{name === null ? `${tier}.${subrank}` : subrank}</span>
      </p>
      {asOf === null ? null : (
        <p className="type-body-small text-text-muted">
          After the ranked match of{' '}
          <time dateTime={formatUtcDate(asOf)} className="whitespace-nowrap type-table">
            {formatUtcDate(asOf)}
          </time>
        </p>
      )}
    </>
  );
}

export function PlayerHeaderSkeleton() {
  return (
    <header aria-busy="true" className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <p className="type-display-xl" aria-hidden="true">
        &nbsp;
      </p>
      <div className="flex items-center gap-4 border border-hairline bg-surface p-4 corner-step-sm">
        <span className="size-12 shrink-0 rounded-full border border-hairline" aria-hidden="true" />
        <p className="type-label uppercase text-text-muted">Rank</p>
      </div>
    </header>
  );
}
