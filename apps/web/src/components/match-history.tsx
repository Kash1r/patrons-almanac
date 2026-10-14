import Link from 'next/link';
import type { ReactNode } from 'react';
import type { HeroRef, PlayerMatch } from '@almanac/api-client';
import { ApiArt } from '@/components/api-art';
import { formatCount, formatUtcDate, formatDuration, formatKda } from '@/lib/format';
import { RESULT_LABEL, TEAM_LABEL } from '@/lib/labels';

export const SHOWN_MATCHES = 20;

const ALIGN = { start: 'text-left', end: 'text-right' } as const;

type Column = {
  readonly header: string;
  readonly align: keyof typeof ALIGN;
  readonly cell: (match: PlayerMatch) => ReactNode;
};

const COLUMNS: readonly Column[] = [
  {
    header: 'Result',
    align: 'start',
    cell: (m) => (
      <Link href={`/match/${m.matchId}`} className={`underline decoration-brass underline-offset-4 ${RESULT_LABEL[m.result].className}`}>
        {RESULT_LABEL[m.result].word}
      </Link>
    ),
  },
  { header: 'Hero', align: 'start', cell: (m) => <HeroCell hero={m.hero} /> },
  {
    header: 'Team',
    align: 'start',
    cell: (m) => <span className={TEAM_LABEL[m.team].className}>{TEAM_LABEL[m.team].name}</span>,
  },
  { header: 'K / D / A', align: 'end', cell: formatKda },
  { header: 'Souls', align: 'end', cell: (m) => formatCount(m.souls) },
  { header: 'Duration', align: 'end', cell: (m) => formatDuration(m.durationS) },
  {
    header: 'Date',
    align: 'end',
    cell: (m) => <time dateTime={formatUtcDate(m.startTime)}>{formatUtcDate(m.startTime)}</time>,
  },
];

export interface MatchHistoryProps {
  readonly matches: readonly PlayerMatch[];
  readonly total: number;
}

export function MatchHistory({ matches, total }: MatchHistoryProps) {
  if (matches.length === 0) {
    return (
      <HistoryCard>
        <p className="mt-2 type-body text-text-muted">No normal-mode matches recorded for this account yet.</p>
      </HistoryCard>
    );
  }
  return (
    <HistoryCard>
      <p className="mt-1 type-body-small text-text-muted">
        <span className="type-table">{formatCount(matches.length)}</span> of{' '}
        <span className="type-table">{formatCount(total)}</span> normal-mode matches
      </p>
      <MatchTable>
        {matches.map((m) => (
          <tr key={m.matchId} className="border-t border-hairline hover:bg-surface-raised">
            {COLUMNS.map((c) => (
              <td key={c.header} className={`px-3 py-2 type-table ${ALIGN[c.align]}`}>
                {c.cell(m)}
              </td>
            ))}
          </tr>
        ))}
      </MatchTable>
    </HistoryCard>
  );
}

export function MatchHistorySkeleton() {
  return (
    <HistoryCard busy>
      <p className="mt-1 type-body-small text-text-muted">Loading matches.</p>
      <MatchTable>
        {Array.from({ length: SHOWN_MATCHES }, (_, i) => (
          <tr key={i} className="border-t border-hairline">
            <td colSpan={COLUMNS.length} className="px-3 py-2">
              <span className="block size-6" />
            </td>
          </tr>
        ))}
      </MatchTable>
    </HistoryCard>
  );
}

function HistoryCard({ busy = false, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <section
      aria-labelledby="recent-matches"
      aria-busy={busy}
      className="mt-8 border border-hairline bg-surface p-4 corner-step-lg md:p-6"
    >
      <h2 id="recent-matches" className="type-h2">
        Recent matches
      </h2>
      {children}
    </section>
  );
}

function MatchTable({ children }: { children: ReactNode }) {
  return (
    <div className="relative -mx-4 mt-4 overflow-x-auto md:mx-0">
      <table className="w-full whitespace-nowrap">
        <thead>
          <tr className="text-text-muted">
            {COLUMNS.map((c) => (
              <th key={c.header} scope="col" className={`px-3 py-2 type-label uppercase ${ALIGN[c.align]}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function HeroCell({ hero }: { hero: HeroRef }) {
  const iconUrl = hero.kind === 'known' ? hero.iconUrl : null;
  return (
    <span className="flex items-center gap-2">
      {iconUrl === null ? (
        <span className="size-6 shrink-0" aria-hidden="true" />
      ) : (
        <ApiArt src={iconUrl} className="size-6 shrink-0 rounded-full" />
      )}
      {hero.kind === 'known' ? hero.name : 'Unknown hero'}
    </span>
  );
}
