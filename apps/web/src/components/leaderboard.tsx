import Link from 'next/link';
import type { ReactNode } from 'react';
import { type LeaderboardRow, type Region, REGIONS } from '@almanac/api-client';
import { ApiArt } from '@/components/api-art';
import { formatCount } from '@/lib/format';

export const PAGE_SIZE = 100;

export const REGION_NAME = {
  Europe: 'Europe',
  Asia: 'Asia',
  NAmerica: 'North America',
  SAmerica: 'South America',
  Oceania: 'Oceania',
} as const satisfies Record<Region, string>;

export const leaderboardHref = (region: Region, page = 1) =>
  page === 1 ? `/leaderboard?region=${region}` : `/leaderboard?region=${region}&page=${page}`;

export function RegionNav({ active }: { active: Region }) {
  return (
    <nav aria-label="Region" className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-b border-hairline">
      {REGIONS.map((region) => (
        <Link
          key={region}
          href={leaderboardHref(region)}
          aria-current={region === active ? 'page' : undefined}
          className={`-mb-px border-b-2 py-2 type-body ${region === active ? 'border-brass text-gilt' : 'border-transparent text-text-muted hover:text-text'}`}
        >
          {REGION_NAME[region]}
        </Link>
      ))}
    </nav>
  );
}

export function LeaderboardTable({ region, rows, page }: { region: Region; rows: readonly LeaderboardRow[]; page: number }) {
  if (rows.length === 0) {
    return (
      <Card region={region}>
        <p className="mt-2 type-body text-text-muted">This leaderboard lists no players yet.</p>
      </Card>
    );
  }
  const pages = Math.ceil(rows.length / PAGE_SIZE);
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const first = (current - 1) * PAGE_SIZE + 1;
  return (
    <Card region={region}>
      <p className="mt-1 type-body-small text-text-muted">
        Places <span className="type-table">{formatCount(first)}</span> to{' '}
        <span className="type-table">{formatCount(first + shown.length - 1)}</span> of{' '}
        <span className="type-table">{formatCount(rows.length)}</span>. Valve updates it hourly; tied players share a place.
      </p>
      <div className="relative -mx-4 mt-4 overflow-x-auto md:mx-0">
        <table className="w-full whitespace-nowrap">
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="px-3 py-2 text-right type-label uppercase">
                Place
              </th>
              <th scope="col" className="px-3 py-2 text-left type-label uppercase">
                Player
              </th>
              <th scope="col" className="px-3 py-2 text-left type-label uppercase">
                Top heroes
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={first + i} className="border-t border-hairline hover:bg-surface-raised">
                <td className="px-3 py-2 text-right type-table">{formatCount(row.position)}</td>
                <td className="px-3 py-2 type-body-small">
                  <PlayerCell row={row} />
                </td>
                <td className="px-3 py-2">
                  <Heroes row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 ? <Pager region={region} page={current} pages={pages} /> : null}
    </Card>
  );
}

/** Names are capped to one line: one listed name is 21 copies of U+FDFD, which renders 2000 px wide. */
const NAME_CLASS = 'inline-block max-w-xs truncate align-bottom';

/** Steam names are not unique, so a name the API ties to several accounts gets no profile link. */
function PlayerCell({ row }: { row: LeaderboardRow }) {
  const name = row.name ?? 'Unnamed player';
  if (row.accountId !== null) {
    return (
      <Link href={`/player/${row.accountId}`} data-steam-name title={name} className={`${NAME_CLASS} underline decoration-brass underline-offset-4`}>
        {name}
      </Link>
    );
  }
  return (
    <>
      <span data-steam-name title={name} className={NAME_CLASS}>
        {name}
      </span>
      {row.possibleAccounts > 1 ? (
        <span className="ml-2 text-text-muted">
          <span className="type-table">{row.possibleAccounts}</span> possible accounts
        </span>
      ) : null}
    </>
  );
}

function Heroes({ row }: { row: LeaderboardRow }) {
  if (row.heroes.length === 0) return <span className="type-body-small text-text-muted">None listed</span>;
  return (
    <ul className="flex gap-2">
      {row.heroes.map((hero) => {
        const name = hero.kind === 'known' ? hero.name : 'Unknown hero';
        return (
          <li key={hero.id} title={name}>
            {hero.kind === 'known' && hero.iconUrl !== null ? (
              <ApiArt src={hero.iconUrl} className="size-6 rounded-full" />
            ) : (
              <span className="block size-6 rounded-full border border-hairline" aria-hidden="true" />
            )}
            <span className="sr-only">{name}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Pager({ region, page, pages }: { region: Region; page: number; pages: number }) {
  return (
    <nav aria-label="Pages" className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 type-body-small">
      {page > 1 ? (
        <Link href={leaderboardHref(region, page - 1)} className="underline decoration-brass underline-offset-4">
          Previous <span className="type-table">{PAGE_SIZE}</span>
        </Link>
      ) : null}
      <span className="text-text-muted">
        Page <span className="type-table">{page}</span> of <span className="type-table">{pages}</span>
      </span>
      {page < pages ? (
        <Link href={leaderboardHref(region, page + 1)} className="underline decoration-brass underline-offset-4">
          Next <span className="type-table">{PAGE_SIZE}</span>
        </Link>
      ) : null}
    </nav>
  );
}

export function LeaderboardSkeleton() {
  return (
    <section aria-busy="true" className="mt-8 border border-hairline bg-surface p-4 corner-step-lg md:p-6">
      <h2 className="type-h2">Standings</h2>
      <p className="mt-1 type-body-small text-text-muted">Loading the leaderboard.</p>
      <div className="mt-4 h-12" />
    </section>
  );
}

function Card({ region, children }: { region: Region; children: ReactNode }) {
  return (
    <section aria-labelledby="standings" className="mt-8 border border-hairline bg-surface p-4 corner-step-lg md:p-6">
      <h2 id="standings" className="type-h2">
        {REGION_NAME[region]} standings
      </h2>
      {children}
    </section>
  );
}
