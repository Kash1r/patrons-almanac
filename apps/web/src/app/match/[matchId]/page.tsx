import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { parseMatchId } from '@almanac/api-client';
import { AlmanacErrorState } from '@/components/almanac-error';
import { ItemTimelines, MatchCurves, MatchHeader, Scoreboards } from '@/components/match-detail';
import { almanac } from '@/server/almanac';

export async function generateMetadata({ params }: PageProps<'/match/[matchId]'>): Promise<Metadata> {
  return { title: `Match ${(await params).matchId}` };
}

export default async function MatchPage({ params }: PageProps<'/match/[matchId]'>) {
  const matchId = parseMatchId((await params).matchId) ?? notFound();
  const match = await almanac.matchDetail(matchId);
  return (
    <main className="mx-auto max-w-5xl px-4 pt-12 pb-8 md:px-6">
      {!match.ok ? (
        <>
          <h1 className="type-display-xl text-gilt">
            Match <span className="type-stat-xl">{matchId}</span>
          </h1>
          <AlmanacErrorState error={match.error} retryHref={`/match/${matchId}`} />
        </>
      ) : match.value === null ? (
        <>
          <h1 className="type-display-xl text-gilt">
            Match <span className="type-stat-xl">{matchId}</span>
          </h1>
          <section className="mt-8 border border-hairline bg-surface p-4 corner-step-lg md:p-6">
            <h2 className="type-h2">No record of this match</h2>
            <p className="mt-2 type-body text-text-muted">
              deadlock-api.com holds no metadata for it. New matches can take a while to arrive.
            </p>
            <Link href="/" className="mt-6 button-brass type-body">
              Back to the almanac
            </Link>
          </section>
        </>
      ) : (
        <>
          <MatchHeader match={match.value} />
          <Scoreboards match={match.value} />
          <MatchCurves match={match.value} />
          <ItemTimelines match={match.value} />
        </>
      )}
    </main>
  );
}
