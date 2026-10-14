import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { parseAccountId } from '@almanac/api-client';
import { AlmanacErrorState } from '@/components/almanac-error';
import { MatchHistory, SHOWN_MATCHES } from '@/components/match-history';
import { PlayerHeader } from '@/components/player-header';
import { PlayerRecord, TopHeroes } from '@/components/player-record';
import { almanac } from '@/server/almanac';

export async function generateMetadata({ params }: PageProps<'/player/[accountId]'>): Promise<Metadata> {
  return { title: `Account ${(await params).accountId}` };
}

export default async function PlayerPage({ params }: PageProps<'/player/[accountId]'>) {
  const accountId = parseAccountId((await params).accountId) ?? notFound();
  const [history, rank, persona] = await Promise.all([
    almanac.matchHistory(accountId),
    almanac.playerRank(accountId),
    almanac.steamPersona(accountId),
  ]);
  return (
    <main className="mx-auto max-w-5xl px-4 pt-12 pb-8 md:px-6">
      <PlayerHeader accountId={accountId} persona={persona} rank={rank} />
      {history.ok ? (
        <>
          <PlayerRecord matches={history.value} />
          <TopHeroes matches={history.value} />
          <MatchHistory matches={history.value.slice(0, SHOWN_MATCHES)} total={history.value.length} />
        </>
      ) : (
        <AlmanacErrorState error={history.error} retryHref={`/player/${accountId}`} />
      )}
    </main>
  );
}
