import { MatchHistorySkeleton } from '@/components/match-history';

export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-12 pb-8 md:px-6">
      <TitlePlaceholder />
      <MatchHistorySkeleton />
    </main>
  );
}

function TitlePlaceholder() {
  return (
    <p className="type-display-xl" aria-hidden="true">
      &nbsp;
    </p>
  );
}
