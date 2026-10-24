import type { SeriesPoint } from "../data/derive.ts";

/** Least-squares line through the points, as start and end values over the series' time span. */
export function trendLine(series: SeriesPoint[]): { start: number; end: number } | undefined {
  if (series.length < 3) return undefined;
  const t0 = Date.parse(series[0]!.at);
  const xs = series.map((s) => (Date.parse(s.at) - t0) / 86_400_000);
  const n = series.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = series.reduce((a, s) => a + s.value, 0) / n;
  const den = xs.reduce((a, v) => a + (v - mx) ** 2, 0);
  if (den === 0) return undefined;
  const slope = xs.reduce((a, v, i) => a + (v - mx) * (series[i]!.value - my), 0) / den;
  const at = (v: number) => my + slope * (v - mx);
  return { start: at(xs[0]!), end: at(xs[n - 1]!) };
}

// Drawn at roughly phone width so the labels stay readable when the picture is scaled to fit.
const W = 360;
const H = 220;
const PAD = { l: 34, r: 62, t: 14, b: 28 };

/** Mean of the first three points, the same baseline the status uses. Needs two points to be worth a line. */
export function baselineOf(series: SeriesPoint[]): number | undefined {
  if (series.length < 2) return undefined;
  const first = series.slice(0, 3);
  return first.reduce((a, s) => a + s.value, 0) / first.length;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The data table spells out the year, since a school year runs across two calendar years. */
export const fmtDateYear = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function Graph({
  series,
  target,
  label,
  unit,
}: {
  series: SeriesPoint[];
  target: number;
  label: string;
  unit: string;
}) {
  const baseline = baselineOf(series);
  const max = Math.max(target, baseline ?? 0, ...series.map((s) => s.value)) * 1.1 || 1;
  const t0 = Date.parse(series[0]?.at ?? "");
  const t1 = Date.parse(series.at(-1)?.at ?? "") || t0 + 1;
  const x = (at: string) =>
    PAD.l + ((Date.parse(at) - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const path = series
    .map((s, i) => `${i === 0 ? "M" : "L"}${x(s.at).toFixed(1)} ${y(s.value).toFixed(1)}`)
    .join(" ");
  const last = series.at(-1);
  const trend = trendLine(series);
  const targetY = y(target);
  // Keep the two right-hand labels from sitting on top of each other when the lines are close.
  const baseLabelY = baseline === undefined ? 0 : y(baseline) + 4;
  const baseLabelShift =
    baseline !== undefined && Math.abs(baseLabelY - (targetY + 4)) < 13
      ? baseLabelY >= targetY + 4
        ? 13 - (baseLabelY - (targetY + 4))
        : -(13 - (targetY + 4 - baseLabelY))
      : 0;
  return (
    <>
      <svg
        className="graph"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}: ${series.length} data points, latest ${last?.value ?? "none"} ${unit}, target ${target} ${unit}`}
      >
        <line className="axis" x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} />
        <line className="axis" x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} />
        <text x={PAD.l - 6} y={y(0) + 4} textAnchor="end">
          0
        </text>
        <text x={PAD.l - 6} y={y(max) + 12} textAnchor="end">
          {Math.round(max)}
        </text>
        <line className="tgt" x1={PAD.l} x2={W - PAD.r} y1={targetY} y2={targetY} />
        <text className="tgt-label" x={W - PAD.r + 6} y={targetY + 4}>
          goal {round1(target)}
        </text>
        {baseline !== undefined && (
          <>
            <line className="base" x1={PAD.l} x2={W - PAD.r} y1={y(baseline)} y2={y(baseline)} />
            <text className="base-label" x={W - PAD.r + 6} y={baseLabelY + baseLabelShift}>
              start {round1(baseline)}
            </text>
          </>
        )}
        {series.length === 0 && (
          <text className="empty-note" x={(PAD.l + W - PAD.r) / 2} y={H / 2} textAnchor="middle">
            No sessions saved yet
          </text>
        )}
        {series.length > 0 && (
          <>
            {trend && (
              <line
                className="trend"
                x1={x(series[0]!.at)}
                y1={y(trend.start)}
                x2={x(last!.at)}
                y2={y(trend.end)}
              />
            )}
            <path className="line" d={path} />
            {series.map((s, i) => (
              <circle key={`${s.at}-${i}`} className="dot" cx={x(s.at)} cy={y(s.value)} r={4} />
            ))}
            <text x={PAD.l} y={H - 8}>
              {fmtDate(series[0]!.at)}
            </text>
            {series.length > 1 && (
              <text x={W - PAD.r} y={H - 8} textAnchor="end">
                {fmtDate(last!.at)}
              </text>
            )}
          </>
        )}
      </svg>
      <p className="legend" aria-hidden="true">
        <span>
          <i className="sw" style={{ borderTopColor: "var(--chart-data)" }} />
          Data
        </span>
        <span>
          <i
            className="sw"
            style={{ borderTopColor: "var(--chart-target)", borderTopStyle: "dashed" }}
          />
          Goal
        </span>
        <span>
          <i
            className="sw"
            style={{ borderTopColor: "var(--chart-trend)", borderTopStyle: "dotted" }}
          />
          Trend
        </span>
        {baseline !== undefined && (
          <span>
            <i
              className="sw"
              style={{ borderTopColor: "var(--text-muted)", borderTopStyle: "dashed" }}
            />
            Start
          </span>
        )}
      </p>
      {series.length > 0 && series.length < 3 && (
        <p className="meta">The trend line appears after 3 sessions.</p>
      )}
      <details>
        <summary>Data table</summary>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>{unit}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s, i) => (
              <tr key={`${s.at}-${i}`}>
                <td>{fmtDateYear(s.at)}</td>
                <td>{s.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

export function Sparkline({ series, target }: { series: SeriesPoint[]; target: number }) {
  const w = 200;
  const h = 44;
  const max = Math.max(target, ...series.map((s) => s.value)) * 1.1 || 1;
  const t0 = Date.parse(series[0]?.at ?? "");
  const span = Math.max(1, Date.parse(series.at(-1)?.at ?? "") - t0);
  const pts = series
    .map(
      (s) =>
        `${(((Date.parse(s.at) - t0) / span) * w).toFixed(1)},${(h - 3 - (s.value / max) * (h - 6)).toFixed(1)}`,
    )
    .join(" ");
  const ty = h - 3 - (target / max) * (h - 6);
  return (
    <svg
      className="spark graph"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line className="tgt" x1={0} x2={w} y1={ty} y2={ty} />
      <polyline className="line" points={pts} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
