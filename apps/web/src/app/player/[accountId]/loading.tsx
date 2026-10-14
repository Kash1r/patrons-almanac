import { MatchHistorySkeleton } from '@/components/match-history';
import { PlayerHeaderSkeleton } from '@/components/player-header';
import { PlayerRecordSkeleton } from '@/components/player-record';

export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-12 pb-8 md:px-6">
      <PlayerHeaderSkeleton />
      <PlayerRecordSkeleton />
      <MatchHistorySkeleton />
    </main>
  );
}
