'use client';

import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { formatCompact, formatCount, formatDuration } from '@/lib/format';
import { TEAM_LABEL, TEAMS } from '@/lib/labels';
import type { TeamPoint } from '@/lib/team-curves';

const HEIGHT = 240;
const PAD = { top: 12, right: 16, bottom: 28, left: 48 };
const END_LABEL_GAP = 16;

export interface TeamChartProps {
  readonly id: string;
  readonly title: string;
  readonly points: readonly TeamPoint[];
}

/**
 * Two team lines on one y-axis, sized in CSS pixels so axis text never scales down on phones.
 * The crosshair snaps to the nearest sample; arrow keys move it when the plot has focus.
 */
export function TeamChart({ id, title, points }: TeamChartProps) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (el === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(Math.max(280, Math.floor(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const last = points.at(-1);
  if (last === undefined) return null;
  const maxS = last.atS;
  const maxV = niceMax(Math.max(...points.flatMap((p) => [p.amber, p.sapphire])));
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (s: number) => PAD.left + (maxS === 0 ? 0 : (s / maxS) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / maxV) * plotH;
  const yTicks = [0, maxV / 4, maxV / 2, (3 * maxV) / 4, maxV];
  const xTicks = minuteTicks(maxS, plotW);
  const endGap = Math.abs(y(last.amber) - y(last.sapphire));

  const nearest = (clientX: number, rect: DOMRect) => {
    const s = ((clientX - rect.left - PAD.left) / plotW) * maxS;
    const distances = points.map((p) => Math.abs(p.atS - s));
    return distances.indexOf(Math.min(...distances));
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.key === 'ArrowLeft' ? -1 : 1;
    setActive((i) => Math.min(points.length - 1, Math.max(0, (i ?? points.length - 1) + step)));
  };
  const shown = active === null ? null : (points[active] ?? null);

  return (
    <figure aria-labelledby={`${id}-title`} className="mt-6">
      <figcaption id={`${id}-title`} className="type-h3">
        {title}
      </figcaption>
      <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 type-body-small">
        {TEAMS.map((team) => (
          <li key={team} className="flex items-center gap-2">
            <svg width="16" height="2" aria-hidden="true">
              <line x1="0" y1="1" x2="16" y2="1" stroke={TEAM_LABEL[team].stroke} strokeWidth="2" />
            </svg>
            {TEAM_LABEL[team].name}
          </li>
        ))}
      </ul>
      <div ref={box} className="relative mt-2 overflow-hidden">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${title}. Use the left and right arrow keys to read each sample.`}
          tabIndex={0}
          onPointerMove={onPointer}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="block touch-pan-y"
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--color-hairline)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="type-label" fill="var(--color-text-muted)">
                {formatCompact(v)}
              </text>
            </g>
          ))}
          {xTicks.map((s) => (
            <text key={s} x={x(s)} y={HEIGHT - 8} textAnchor="middle" className="type-label" fill="var(--color-text-muted)">
              {formatDuration(s)}
            </text>
          ))}
          {TEAMS.map((team) => (
            <polyline
              key={team}
              points={points.map((p) => `${x(p.atS)},${y(p[team])}`).join(' ')}
              fill="none"
              stroke={TEAM_LABEL[team].stroke}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {TEAMS.map((team) => (
            <circle key={team} cx={x(last.atS)} cy={y(last[team])} r="4" fill={TEAM_LABEL[team].stroke} stroke="var(--color-surface)" strokeWidth="2" />
          ))}
          {shown === null ? null : (
            <g>
              <line x1={x(shown.atS)} x2={x(shown.atS)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-text-muted)" strokeWidth="1" />
              {TEAMS.map((team) => (
                <circle key={team} cx={x(shown.atS)} cy={y(shown[team])} r="4" fill={TEAM_LABEL[team].stroke} stroke="var(--color-surface)" strokeWidth="2" />
              ))}
            </g>
          )}
        </svg>
        {endGap < END_LABEL_GAP ? null : (
          <EndLabels last={last} y={y} />
        )}
        {shown === null ? null : <Readout point={shown} left={x(shown.atS)} width={width} />}
      </div>
    </figure>
  );
}

function EndLabels({ last, y }: { last: TeamPoint; y: (v: number) => number }) {
  return (
    <>
      {TEAMS.map((team) => (
        <span
          key={team}
          className="pointer-events-none absolute -translate-y-full pb-1 type-label text-text"
          style={{ top: y(last[team]), right: 0 }}
        >
          {formatCompact(last[team])}
        </span>
      ))}
    </>
  );
}

const READOUT_WIDTH_PX = 224;

/** Beside the crosshair where it fits, else pinned to whichever chart edge leaves it whole. */
function Readout({ point, left, width }: { point: TeamPoint; left: number; width: number }) {
  const place =
    left + 8 + READOUT_WIDTH_PX <= width
      ? { top: 0, left: left + 8 }
      : left - 8 - READOUT_WIDTH_PX >= 0
        ? { top: 0, right: width - left + 8 }
        : { top: 0, [left < width / 2 ? 'right' : 'left']: 0 };
  return (
    <div
      role="status"
      className="pointer-events-none absolute border border-hairline bg-surface-raised p-2"
      style={place}
    >
      <p className="type-label text-text-muted">{formatDuration(point.atS)}</p>
      {TEAMS.map((team) => (
        <p key={team} className="flex items-center gap-2 whitespace-nowrap">
          <svg width="12" height="2" aria-hidden="true">
            <line x1="0" y1="1" x2="12" y2="1" stroke={TEAM_LABEL[team].stroke} strokeWidth="2" />
          </svg>
          <span className="type-table text-text">{formatCount(point[team])}</span>
          <span className="type-body-small text-text-muted">{TEAM_LABEL[team].name}</span>
        </p>
      ))}
    </div>
  );
}

/** Rounds the top of the axis up to 1, 2 or 5 times a power of ten, split in quarters. */
function niceMax(v: number): number {
  if (v <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].map((m) => (m * pow) / 4).find((s) => s * 4 >= v) ?? (10 * pow) / 4;
  return step * 4;
}

const MIN_TICK_GAP_PX = 64;

/** Every 5, 10 or 15 minutes, whichever first leaves room for each label. */
function minuteTicks(maxS: number, plotW: number): number[] {
  const every = [300, 600, 900].find((s) => maxS === 0 || (s / maxS) * plotW >= MIN_TICK_GAP_PX) ?? 1200;
  const ticks: number[] = [];
  for (let s = 0; s <= maxS; s += every) ticks.push(s);
  return ticks;
}
