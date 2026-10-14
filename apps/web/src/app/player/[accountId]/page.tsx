import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { type PlayerMatch, parseAccountId } from '@almanac/api-client';
import { AlmanacErrorState } from '@/components/almanac-error';
import { MatchHistory, SHOWN_MATCHES } from '@/components/match-history';
import { ModeNav, profileHref } from '@/components/mode-nav';
import { PlayerHeader } from '@/components/player-header';
import { PlayerRecord, TopHeroes } from '@/components/player-record';
import { MODE_SCOPE, filterByMode, parseModeFilter } from '@/lib/mode-filter';
import { almanac } from '@/server/almanac';

export async function generateMetadata({ params }: PageProps<'/player/[accountId]'>): Promise<Metadata> {
  return { title: `Account ${(await params).accountId}` };
}

export default async function PlayerPage({ params, searchParams }: PageProps<'/player/[accountId]'>) {
  const accountId = parseAccountId((await params).accountId) ?? notFound();
  const filter = parseModeFilter((await searchParams).mode);
  const scope = MODE_SCOPE[filter];
  const [history, rank, persona] = await Promise.all([
    almanac.matchHistory(accountId),
    almanac.playerRank(accountId),
    almanac.steamPersona(accountId),
  ]);
  return (
    <main className="mx-auto max-w-5xl px-4 pt-12 pb-8 md:px-6">
      <PlayerHeader accountId={accountId} persona={persona} rank={rank} />
      <ModeNav accountId={accountId} active={filter} />
      {history.ok ? (
        <ModeSections matches={filterByMode(history.value, filter)} scope={scope} />
      ) : (
        <AlmanacErrorState error={history.error} retryHref={profileHref(accountId, filter)} />
      )}
    </main>
  );
}

function ModeSections({ matches, scope }: { matches: readonly PlayerMatch[]; scope: string }) {
  return (
    <>
      <PlayerRecord matches={matches} scope={scope} />
      <TopHeroes matches={matches} />
      <MatchHistory matches={matches.slice(0, SHOWN_MATCHES)} total={matches.length} scope={scope} />
    </>
  );
}
