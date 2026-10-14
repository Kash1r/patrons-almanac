'use client';

import { type ReactNode, useState } from 'react';
import type { Team } from '@almanac/api-client';
import { TEAM_LABEL, TEAMS } from '@/lib/labels';

/** Phones show one team at a time; from 768px both panels show and the tabs hide. */
export function TeamTabs({ id, panels }: { id: string; panels: Record<Team, ReactNode> }) {
  const [selected, setSelected] = useState<Team>('amber');
  return (
    <>
      <div role="tablist" aria-label="Team" className="mt-4 flex gap-6 border-b border-hairline md:hidden">
        {TEAMS.map((team) => (
          <button
            key={team}
            type="button"
            role="tab"
            id={`${id}-tab-${team}`}
            aria-controls={`${id}-panel-${team}`}
            aria-selected={selected === team}
            onClick={() => setSelected(team)}
            className={`-mb-px border-b-2 py-2 type-body-small ${selected === team ? 'border-brass text-gilt' : 'border-transparent text-text-muted'}`}
          >
            {TEAM_LABEL[team].name}
          </button>
        ))}
      </div>
      {TEAMS.map((team) => (
        <div
          key={team}
          id={`${id}-panel-${team}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${team}`}
          className={selected === team ? 'block' : 'hidden md:block'}
        >
          {panels[team]}
        </div>
      ))}
    </>
  );
}
