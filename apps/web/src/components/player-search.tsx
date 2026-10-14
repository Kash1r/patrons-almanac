import Link from 'next/link';
import type { ReactNode } from 'react';
import { type SearchQuery, MAX_SEARCH_LENGTH, accountIdFromQuery } from '@almanac/api-client';
import { AlmanacErrorState } from '@/components/almanac-error';
import { formatCount } from '@/lib/format';
import { almanac } from '@/server/almanac';

/** A plain GET form, so search works before hydration and every result page has a URL. */
export function SearchForm({ query }: { query: SearchQuery | null }) {
  return (
    <form action="/" method="get" role="search" className="mt-8">
      <label htmlFor="q" className="type-label uppercase text-text-muted">
        Player name, account id or Steam profile link
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query ?? ''}
          maxLength={MAX_SEARCH_LENGTH}
          autoComplete="off"
          spellCheck={false}
          required
          className="min-w-0 flex-1 rounded-sm border border-brass bg-surface px-3 py-2 type-body text-text"
        />
        <button type="submit" className="button-brass type-body">
          Search
        </button>
      </div>
    </form>
  );
}

export async function SearchResults({ query }: { query: SearchQuery }) {
  const direct = accountIdFromQuery(query);
  const hits = await almanac.searchPlayers(query);
  const directLink =
    direct === null ? null : (
      <p className="mt-2 type-body">
        <Link href={`/player/${direct}`} className="underline decoration-brass underline-offset-4">
          Open account <span className="type-table">{direct}</span>
        </Link>
      </p>
    );
  if (!hits.ok) {
    return (
      <>
        {directLink === null ? null : <div className="mt-8">{directLink}</div>}
        <AlmanacErrorState error={hits.error} retryHref={`/?q=${encodeURIComponent(query)}`} />
      </>
    );
  }
  return (
    <ResultsCard>
      {directLink}
      {hits.value.length === 0 ? (
        <p className="mt-2 type-body text-text-muted">
          No players found for &ldquo;{query}&rdquo;. Search skips players with fewer than{' '}
          <span className="type-table">5</span> matches in the last <span className="type-table">30</span> days; an
          account id or Steam profile link opens the profile directly.
        </p>
      ) : (
        <>
          <p className="mt-1 type-body-small text-text-muted">
            <span className="type-table">{formatCount(hits.value.length)}</span> closest Steam names for &ldquo;{query}&rdquo;
          </p>
          <ol className="mt-4">
            {hits.value.map((hit) => (
              <li key={hit.accountId} className="border-t border-hairline">
                <Link href={`/player/${hit.accountId}`} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-3 py-3 hover:bg-surface-raised">
                  <span className="type-h3 break-all">{hit.name}</span>
                  <span className="type-body-small text-text-muted">
                    Account <span className="type-table">{hit.accountId}</span> &middot;{' '}
                    <span className="type-table">{formatCount(hit.matchesLast30d)}</span> matches in the last{' '}
                    <span className="type-table">30</span> days
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </ResultsCard>
  );
}

export function SearchResultsSkeleton() {
  return (
    <ResultsCard busy>
      <p className="mt-1 type-body-small text-text-muted">Searching.</p>
      <div className="mt-4 h-12" />
    </ResultsCard>
  );
}

function ResultsCard({ busy = false, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby="results" aria-busy={busy} className="mt-8 border border-hairline bg-surface p-4 corner-step-lg md:p-6">
      <h2 id="results" className="type-h2">
        Players
      </h2>
      {children}
    </section>
  );
}
