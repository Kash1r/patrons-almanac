import type { Metadata } from 'next';
import { Suspense } from 'react';
import { type Region, parseRegion } from '@almanac/api-client';
import { AlmanacErrorState } from '@/components/almanac-error';
import { LeaderboardSkeleton, LeaderboardTable, RegionNav, leaderboardHref } from '@/components/leaderboard';
import { almanac } from '@/server/almanac';

export const metadata: Metadata = { title: 'Leaderboard' };

const DEFAULT_REGION: Region = 'NAmerica';

/** An unknown region or page falls back to the default rather than 404, since both come from links. */
export default async function LeaderboardPage({ searchParams }: PageProps<'/leaderboard'>) {
  const { region: rawRegion, page: rawPage } = await searchParams;
  const region = (typeof rawRegion === 'string' ? parseRegion(rawRegion) : null) ?? DEFAULT_REGION;
  const page = typeof rawPage === 'string' && /^[1-9][0-9]?$/.test(rawPage) ? Number(rawPage) : 1;
  return (
    <main className="mx-auto max-w-5xl px-4 pt-12 pb-8 md:px-6">
      <h1 className="type-display-xl text-gilt">Leaderboard</h1>
      <p className="mt-4 type-body">The top of Deadlock&apos;s ranked ladder, by region.</p>
      <RegionNav active={region} />
      <Suspense key={`${region}:${page}`} fallback={<LeaderboardSkeleton />}>
        <Standings region={region} page={page} />
      </Suspense>
    </main>
  );
}

async function Standings({ region, page }: { region: Region; page: number }) {
  const rows = await almanac.leaderboard(region);
  return rows.ok ? (
    <LeaderboardTable region={region} rows={rows.value} page={page} />
  ) : (
    <AlmanacErrorState error={rows.error} retryHref={leaderboardHref(region, page)} />
  );
}
