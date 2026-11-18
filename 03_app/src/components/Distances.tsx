import { useMemo } from "react";
import type { Match } from "../api";
import { median, ramp } from "../scale";

const W = 420;
const H = 240;
const M = { top: 36, right: 12, bottom: 34, left: 40 };
const BINS = 40;

// How far your plan is from each of the 5,000 plans, with the five matches marked.
// The bars use the map's colours, so this chart is also the map's legend.
export function Distances({ distances, matches, hoverRank }: { distances: number[]; matches: Match[]; hoverRank: number | null }) {
  const { bins, max, mid, top } = useMemo(() => {
    const sorted = [...distances].sort((a, b) => a - b);
    const max = sorted[sorted.length - 1];
    const counts = new Array(BINS).fill(0);
    for (const d of distances) counts[Math.min(BINS - 1, Math.floor((d / max) * BINS))]++;
    // colour of a bar: the share of plans closer than its middle, as on the map
    let below = 0;
    const bins = counts.map((count, i) => {
      const bar = { count, from: (i / BINS) * max, rank: (below + count / 2) / distances.length };
      below += count;
      return bar;
    });
    return { bins, max, mid: median(sorted), top: Math.max(...counts) };
  }, [distances]);

  const x = (d: number) => M.left + (d / max) * (W - M.left - M.right);
  const y = (count: number) => H - M.bottom - (count / top) * (H - M.top - M.bottom);
  const ticks = niceTicks(max);
  const first = matches[0].distance;
  const last = matches[matches.length - 1].distance;

  return (
    <figure className="figure">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Histogram of the distances to the 5,000 plans. Median ${mid.toFixed(1)}; the five matches are between ${first.toFixed(1)} and ${last.toFixed(1)}.`}>
        {bins.map((bar, i) => (
          <rect key={i} x={x(bar.from) + 0.5} width={Math.max(0, x(max / BINS) - x(0) - 1)} y={y(bar.count)} height={H - M.bottom - y(bar.count)} fill={ramp(bar.rank)} />
        ))}
        <line className="axis" x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} />
        {ticks.map((t) => (
          <text key={t} className="tick" x={x(t)} y={H - M.bottom + 16} textAnchor="middle">{t}</text>
        ))}
        <text className="tick" x={M.left - 6} y={M.top + 4} textAnchor="end">{top}</text>
        <text className="tick" x={M.left - 6} y={H - M.bottom} textAnchor="end">0</text>
        <text className="axis-label" x={W - M.right} y={H - 4} textAnchor="end">distance to your plan</text>
        <text className="axis-label" x={0} y={27}>plans</text>

        <line className="median" x1={x(mid)} x2={x(mid)} y1={31} y2={H - M.bottom} />
        <text className="median-label" x={x(mid) + 4} y={27}>median {mid.toFixed(1)}</text>

        {matches.map((m) => (
          <line key={m.rank} className="match-tick" data-hover={hoverRank === m.rank || undefined}
            x1={x(m.distance)} x2={x(m.distance)} y1={15} y2={H - M.bottom} />
        ))}
        {groups(matches.map((m) => x(m.distance))).map(([a, b]) => (
          <text key={a} className="match-label" x={x(matches[a].distance)} y={12}>
            {a === b ? `match ${a + 1}` : `matches ${a + 1}–${b + 1}`}
          </text>
        ))}
      </svg>
      <figcaption>
        {first >= 1
          ? <>Match 1 is at <b>{first.toFixed(1)}</b>, the median plan at <b>{mid.toFixed(1)}</b>: {(mid / first).toFixed(0)} times farther. </>
          : <>Match 1 is at <b>{first.toFixed(1)}</b>, practically the same plan; the median plan is at <b>{mid.toFixed(1)}</b>. </>}
        Each network measures in its own units, so compare distances only within one network.
      </figcaption>
    </figure>
  );
}

// Matches whose lines are closer than 60 px share one label
function groups(xs: number[]) {
  const out: [number, number][] = [];
  xs.forEach((x, i) => {
    const last = out[out.length - 1];
    if (last && x - xs[last[0]] < 60) last[1] = i;
    else out.push([i, i]);
  });
  return out;
}

function niceTicks(max: number) {
  const step = [10, 20, 25, 50, 100, 200, 250, 500].find((s) => max / s <= 5) ?? 1000;
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
}
