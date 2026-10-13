import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { parseAccountId } from '@almanac/api-client';
import { AlmanacErrorState } from '@/components/almanac-error';
import { MatchHistory, SHOWN_MATCHES } from '@/components/match-history';
import { almanac } from '@/server/almanac';

export async function generateMetadata({ params }: PageProps<'/player/[accountId]'>): Promise<Metadata> {
  return { title: `Account ${(await params).accountId}` };
}

export default async function PlayerPage({ params }: PageProps<'/player/[accountId]'>) {
  const accountId = parseAccountId((await params).accountId) ?? notFound();
  const history = await almanac.matchHistory(accountId);
  return (
    <main className="mx-auto max-w-5xl px-4 pt-12 pb-8 md:px-6">
      <h1 className="type-display-xl text-gilt">
        Account <span className="type-stat-xl">{accountId}</span>
      </h1>
      {history.ok ? (
        <MatchHistory matches={history.value.slice(0, SHOWN_MATCHES)} total={history.value.length} />
      ) : (
        <AlmanacErrorState error={history.error} retryHref={`/player/${accountId}`} />
      )}
    </main>
  );
}
