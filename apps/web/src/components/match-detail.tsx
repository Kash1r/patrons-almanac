import Link from 'next/link';
import type { ReactNode } from 'react';
import type { MatchDetail, MatchPlayer, Team } from '@almanac/api-client';
import { ApiArt } from '@/components/api-art';
import { HeroCell } from '@/components/match-history';
import { TeamChart } from '@/components/team-chart';
import { TeamTabs } from '@/components/team-tabs';
import { formatCount, formatDuration, formatKda, formatUtcDate } from '@/lib/format';
import { RESULT_LABEL, TEAM_LABEL, TEAMS } from '@/lib/labels';
import { teamCurves } from '@/lib/team-curves';

export function MatchHeader({ match }: { match: MatchDetail }) {
  return (
    <header>
      <h1 className="type-display-xl text-gilt">
        Match <span className="type-stat-xl">{match.matchId}</span>
      </h1>
      <section aria-label="Result" className="mt-6 border border-brass bg-surface p-4 corner-step-lg md:p-6">
        <p className="type-h2">
          <span className={TEAM_LABEL[match.winner].className}>{TEAM_LABEL[match.winner].name}</span> won
        </p>
        <p className="mt-1 type-body-small text-text-muted">
          <span className="type-table">{formatDuration(match.durationS)}</span> long, played{' '}
          <time dateTime={formatUtcDate(match.startTime)} className="type-table">
            {formatUtcDate(match.startTime)}
          </time>
        </p>
      </section>
    </header>
  );
}

const ALIGN = { start: 'text-left', end: 'text-right' } as const;

type Column = { readonly header: string; readonly align: keyof typeof ALIGN; readonly cell: (p: MatchPlayer) => ReactNode };

const COLUMNS: readonly Column[] = [
  { header: 'Hero', align: 'start', cell: (p) => <HeroCell hero={p.hero} /> },
  { header: 'Player', align: 'start', cell: (p) => <PlayerName player={p} /> },
  { header: 'K / D / A', align: 'end', cell: formatKda },
  { header: 'Souls', align: 'end', cell: (p) => formatCount(p.souls) },
  { header: 'Last hits', align: 'end', cell: (p) => formatCount(p.lastHits) },
  { header: 'Denies', align: 'end', cell: (p) => formatCount(p.denies) },
  { header: 'Hero damage', align: 'end', cell: (p) => formatCount(p.heroDamage) },
  { header: 'Level', align: 'end', cell: (p) => p.level },
];

export function Scoreboards({ match }: { match: MatchDetail }) {
  return (
    <Card id="scoreboards" title="Scoreboards">
      <TeamTabs id="scoreboard" panels={byTeam((team) => <Scoreboard match={match} team={team} />)} />
    </Card>
  );
}

function Scoreboard({ match, team }: { match: MatchDetail; team: Team }) {
  const result = match.winner === team ? RESULT_LABEL.win : RESULT_LABEL.loss;
  return (
    <section aria-label={TEAM_LABEL[team].name} className="mt-6">
      <h3 className="type-h3">
        <span className={TEAM_LABEL[team].className}>{TEAM_LABEL[team].name}</span>{' '}
        <span className={`type-label uppercase ${result.className}`}>{result.word}</span>
      </h3>
      <div className="relative -mx-4 mt-2 overflow-x-auto md:mx-0">
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
          <tbody>
            {match.players
              .filter((p) => p.team === team)
              .map((p) => (
                <tr key={p.slot} className="border-t border-hairline hover:bg-surface-raised">
                  {COLUMNS.map((c) => (
                    <td key={c.header} className={`px-3 py-2 type-table ${ALIGN[c.align]}`}>
                      {c.cell(p)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Account 0 is a bot or hidden player, so it has no profile to link. */
function PlayerName({ player }: { player: MatchPlayer }) {
  if (player.accountId === 0) return <span className="text-text-muted">Hidden</span>;
  return (
    <Link href={`/player/${player.accountId}`} className="underline decoration-brass underline-offset-4">
      {player.name ?? <span className="type-table">{player.accountId}</span>}
    </Link>
  );
}

export function MatchCurves({ match }: { match: MatchDetail }) {
  const curves = teamCurves(match.players);
  return (
    <Card id="curves" title="Souls and damage">
      {curves.souls.length === 0 ? (
        <p className="mt-2 type-body text-text-muted">This match carries no timed stats.</p>
      ) : (
        <>
          <p className="mt-1 type-body-small text-text-muted">Team totals at each sample the match recorded</p>
          <TeamChart id="souls" title="Souls" points={curves.souls} />
          <TeamChart id="hero-damage" title="Damage to heroes" points={curves.heroDamage} />
          <details className="mt-6">
            <summary className="cursor-pointer type-body-small text-text-muted">Show the samples as a table</summary>
            <div className="relative -mx-4 mt-2 overflow-x-auto md:mx-0">
              <table className="w-full whitespace-nowrap">
                <thead>
                  <tr className="text-text-muted">
                    {['Time', 'Amber souls', 'Sapphire souls', 'Amber damage', 'Sapphire damage'].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 text-right type-label uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {curves.souls.map((s, i) => {
                    const d = curves.heroDamage[i];
                    return d === undefined ? null : (
                      <tr key={s.atS} className="border-t border-hairline">
                        {[formatDuration(s.atS), s.amber, s.sapphire, d.amber, d.sapphire].map((v, j) => (
                          <td key={j} className="px-3 py-2 text-right type-table">
                            {typeof v === 'number' ? formatCount(v) : v}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </Card>
  );
}

export function ItemTimelines({ match }: { match: MatchDetail }) {
  const unavailable = match.players.some((p) => p.items === null);
  return (
    <Card id="items" title="Item timelines">
      {unavailable ? (
        <p className="mt-2 type-body text-text-muted">Item names could not be loaded from deadlock-api.com. Try again later.</p>
      ) : (
        <>
          <p className="mt-1 type-body-small text-text-muted">Shop items in buying order, with the minute each was bought</p>
          <TeamTabs
            id="items"
            panels={byTeam((team) => (
              <ul aria-label={TEAM_LABEL[team].name} className="mt-4">
                {match.players
                  .filter((p) => p.team === team)
                  .map((p) => (
                    <li key={p.slot} className="border-t border-hairline py-3">
                      <p className="flex flex-wrap items-baseline gap-x-3 type-body-small">
                        <span className="type-table">
                          <HeroCell hero={p.hero} />
                        </span>
                        <span className="text-text-muted">{p.name ?? 'Unnamed player'}</span>
                      </p>
                      <ItemRow player={p} />
                    </li>
                  ))}
              </ul>
            ))}
          />
        </>
      )}
    </Card>
  );
}

function ItemRow({ player }: { player: MatchPlayer }) {
  const items = player.items ?? [];
  if (items.length === 0) return <p className="mt-2 type-body-small text-text-muted">No shop items bought.</p>;
  return (
    <ol className="mt-2 flex flex-wrap gap-3">
      {items.map((i, n) => (
        <li key={n} className="flex w-12 flex-col items-center" title={i.item.name}>
          {i.item.iconUrl === null ? (
            <span className="size-8 border border-hairline" aria-hidden="true" />
          ) : (
            <ApiArt src={i.item.iconUrl} className="size-8" />
          )}
          <span className="sr-only">{i.item.name}, bought at </span>
          <span className="type-label">{formatDuration(i.boughtAtS)}</span>
          {i.soldAtS === null ? null : (
            <span className="type-label text-text-muted">
              <span className="sr-only">, </span>sold
              <span className="sr-only"> at {formatDuration(i.soldAtS)}</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function MatchSkeleton() {
  return (
    <>
      <p className="type-display-xl" aria-hidden="true">
        &nbsp;
      </p>
      {['Scoreboards', 'Souls and damage', 'Item timelines'].map((title) => (
        <Card key={title} id={title} title={title} busy>
          <p className="mt-1 type-body-small text-text-muted">Loading the match.</p>
          <div className="mt-4 h-12" />
        </Card>
      ))}
    </>
  );
}

function byTeam(render: (team: Team) => ReactNode): Record<Team, ReactNode> {
  return Object.fromEntries(TEAMS.map((team) => [team, render(team)])) as Record<Team, ReactNode>;
}

function Card({ id, title, busy = false, children }: { id: string; title: string; busy?: boolean; children: ReactNode }) {
  const headingId = `${id.toLowerCase().replace(/\W+/g, '-')}-heading`;
  return (
    <section aria-labelledby={headingId} aria-busy={busy} className="mt-8 border border-hairline bg-surface p-4 corner-step-lg md:p-6">
      <h2 id={headingId} className="type-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}
