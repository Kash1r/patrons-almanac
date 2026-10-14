import Link from 'next/link';
import type { AccountId } from '@almanac/api-client';
import { MODE_FILTERS, type ModeFilter } from '@/lib/mode-filter';

const LABEL = { all: 'All', ranked: 'Ranked', unranked: 'Unranked' } as const satisfies Record<ModeFilter, string>;

export const profileHref = (accountId: AccountId, filter: ModeFilter) =>
  filter === 'all' ? `/player/${accountId}` : `/player/${accountId}?mode=${filter}`;

/** Links rather than buttons: each view has a URL and works before hydration. */
export function ModeNav({ accountId, active }: { accountId: AccountId; active: ModeFilter }) {
  return (
    <nav aria-label="Match mode" className="mt-8 flex gap-6 border-b border-hairline">
      {MODE_FILTERS.map((filter) => (
        <Link
          key={filter}
          href={profileHref(accountId, filter)}
          scroll={false}
          aria-current={filter === active ? 'page' : undefined}
          className={`-mb-px border-b-2 py-2 type-body ${filter === active ? 'border-brass text-gilt' : 'border-transparent text-text-muted hover:text-text'}`}
        >
          {LABEL[filter]}
        </Link>
      ))}
    </nav>
  );
}
