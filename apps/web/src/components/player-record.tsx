import type { ReactNode } from 'react';
import type { PlayerMatch } from '@almanac/api-client';
import { HeroCell } from '@/components/match-history';
import { WinRate } from '@/components/win-rate';
import { formatAverage, formatCount, formatRatio } from '@/lib/format';
import { type Tally, isLowSample, kdaRatio, tally, topHeroes } from '@/lib/record';

export const TOP_HERO_COUNT = 5;

/** Win rate and KDA over every match of `scope` the API holds for the account. */
export function PlayerRecord({ matches, scope }: { matches: readonly PlayerMatch[]; scope: string }) {
  const t = tally(matches);
  const low = isLowSample(t.matches);
  return (
    <Card id="record" title="Record">
      {t.matches === 0 ? (
        <p className="mt-2 type-body text-text-muted">No {scope} matches to tally yet.</p>
      ) : (
        <>
          <p className="mt-1 type-body-small text-text-muted">
            All <span className="type-table">{formatCount(t.matches)}</span> recorded {scope} matches
          </p>
          <dl className="mt-4 grid gap-6 md:grid-cols-2">
            <StatBlock label="Win rate" lowSample={low} value={<WinRate wins={t.wins} matches={t.matches} />}>
              <span className="type-table">{formatCount(t.wins)}</span> wins,{' '}
              <span className="type-table">{formatCount(t.matches - t.wins)}</span> losses
            </StatBlock>
            <StatBlock label="KDA" lowSample={low} value={formatRatio(kdaRatio(t))}>
              <AverageKda tally={t} /> per match
            </StatBlock>
          </dl>
        </>
      )}
    </Card>
  );
}

const HERO_COLUMNS = ['Matches', 'Win rate', 'KDA', 'Avg K / D / A'] as const;

export function TopHeroes({ matches }: { matches: readonly PlayerMatch[] }) {
  const heroes = topHeroes(matches, TOP_HERO_COUNT);
  return (
    <Card id="top-heroes" title="Top heroes">
      {heroes.length === 0 ? (
        <p className="mt-2 type-body text-text-muted">No heroes played yet.</p>
      ) : (
        <>
          <p className="mt-1 type-body-small text-text-muted">Most played, over the same matches</p>
          <div className="relative -mx-4 mt-4 overflow-x-auto md:mx-0">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr className="text-text-muted">
                  <th scope="col" className="px-3 py-2 text-left type-label uppercase">
                    Hero
                  </th>
                  {HERO_COLUMNS.map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 text-right type-label uppercase">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heroes.map((h) => (
                  <tr key={h.hero.id} className="border-t border-hairline hover:bg-surface-raised">
                    <td className="px-3 py-2 type-table">
                      <HeroCell hero={h.hero} />
                    </td>
                    <td className="px-3 py-2 text-right type-table">{formatCount(h.matches)}</td>
                    <td className="px-3 py-2 text-right type-table">
                      <WinRate wins={h.wins} matches={h.matches} />
                    </td>
                    <td className={`px-3 py-2 text-right type-table ${isLowSample(h.matches) ? 'text-text-muted' : ''}`}>
                      {formatRatio(kdaRatio(h))}
                    </td>
                    <td className="px-3 py-2 text-right type-table">
                      <AverageKda tally={h} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

export function PlayerRecordSkeleton() {
  return (
    <>
      <Card id="record" title="Record" busy>
        <p className="mt-1 type-body-small text-text-muted">Tallying matches.</p>
        <div className="mt-4 h-12" />
      </Card>
      <Card id="top-heroes" title="Top heroes" busy>
        <p className="mt-1 type-body-small text-text-muted">Tallying heroes.</p>
        <div className="mt-4 h-12" />
      </Card>
    </>
  );
}

function AverageKda({ tally: t }: { tally: Tally }) {
  const avg = (n: number) => formatAverage(n / t.matches);
  return <span className="type-table">{`${avg(t.kills)} / ${avg(t.deaths)} / ${avg(t.assists)}`}</span>;
}

interface StatBlockProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly lowSample: boolean;
  readonly children: ReactNode;
}

function StatBlock({ label, value, lowSample, children }: StatBlockProps) {
  return (
    <div>
      <dt className="type-label uppercase text-text-muted">{label}</dt>
      <dd className={`mt-1 type-stat-xl ${lowSample ? 'text-text-muted' : 'text-gilt'}`}>{value}</dd>
      <dd className="mt-1 type-body-small text-text-muted">{children}</dd>
    </div>
  );
}

function Card({ id, title, busy = false, children }: { id: string; title: string; busy?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={id} aria-busy={busy} className="mt-8 border border-hairline bg-surface p-4 corner-step-lg md:p-6">
      <h2 id={id} className="type-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}
