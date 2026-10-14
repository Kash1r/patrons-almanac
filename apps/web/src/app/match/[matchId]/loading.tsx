import { MatchSkeleton } from '@/components/match-detail';

export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-12 pb-8 md:px-6">
      <MatchSkeleton />
    </main>
  );
}
