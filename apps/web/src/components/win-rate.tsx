import { formatPercent } from '@/lib/format';
import { isLowSample, winRate } from '@/lib/record';

/** A win rate under 50 matches is muted and says so, whatever colour its context gives it. */
export function WinRate({ wins, matches }: { wins: number; matches: number }) {
  if (!isLowSample(matches)) return <>{formatPercent(winRate({ wins, matches }))}</>;
  return (
    <span className="text-text-muted">
      {formatPercent(winRate({ wins, matches }))} <span className="type-label">low sample</span>
    </span>
  );
}
