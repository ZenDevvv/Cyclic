// Rating after each rated game: one amber line, 3–5 faint gridlines, round ticks above the max, no markers.
import { useMemo } from 'react';

interface Point {
  at: number;
  rating: number;
}

function niceTicks(min: number, max: number): number[] {
  const span = Math.max(40, max - min);
  const raw = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 4) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step + (max % step === 0 ? step : 0);
  const out: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(Math.round(v));
  return out;
}

export function RatingChart({ points, height = 180 }: { points: Point[]; height?: number }) {
  const W = 640;
  const H = height;
  const pad = { l: 40, r: 8, t: 10, b: 22 };
  const { ticks, path, xLabels } = useMemo(() => {
    const ratings = points.map((p) => p.rating);
    const ticks = niceTicks(Math.min(...ratings), Math.max(...ratings));
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const x = (i: number) => pad.l + (points.length < 2 ? 0 : (i / (points.length - 1)) * (W - pad.l - pad.r));
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join('');
    const xLabels = points.length > 1 ? [{ x: x(0), text: 'Start', anchor: 'start' as const }, { x: x(points.length - 1), text: `Game ${points.length - 1}`, anchor: 'end' as const }] : [];
    return { ticks: ticks.map((t) => ({ v: t, y: y(t) })), path, xLabels };
  }, [points, H]);

  if (points.length < 2) {
    return <p className="text-body text-muted">The rating line starts after the first rated game.</p>;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Rating history: ${points[0].rating} to ${points[points.length - 1].rating} over ${points.length - 1} rated games`}>
      {ticks.map((t) => (
        <g key={t.v}>
          <line x1={pad.l} x2={W - pad.r} y1={t.y} y2={t.y} stroke="var(--rule)" strokeWidth="1" />
          <text x={pad.l - 8} y={t.y + 4} textAnchor="end" fontSize="12" fill="var(--faint)" className="num">
            {t.v}
          </text>
        </g>
      ))}
      {xLabels.map((l) => (
        <text key={l.text} x={l.x} y={H - 4} textAnchor={l.anchor} fontSize="12" fill="var(--faint)">
          {l.text}
        </text>
      ))}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
