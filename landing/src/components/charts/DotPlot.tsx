import { useState } from "react";
import { ChartFrame, DataTable, Legend, Marker, Tooltip, useWidth, type Series, type Tip } from "./common";

export interface DotRow<K extends string> {
  label: string;
  /** Marked with an asterisk and explained in the caption (e.g. "fitted on this fire"). */
  starred?: boolean;
  values: Record<K, number>;
}

/**
 * One row per item (a fire), one marker per series on a shared axis, joined by a thin line: how far apart the
 * versions are, item by item. Linear or log axis, an optional shaded band and a reference rule.
 */
export function DotPlot<K extends string>({
  label,
  rows,
  series,
  domain,
  log = false,
  ticks,
  tick,
  value,
  band,
  rule,
  axis,
  sortBy,
}: {
  label: string;
  rows: DotRow<K>[];
  series: Series<K>[];
  domain: [number, number];
  log?: boolean;
  ticks: number[];
  tick: (v: number) => string;
  value: (v: number) => string;
  band?: [number, number, string];
  rule?: [number, string];
  axis: string;
  sortBy: K;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const sorted = [...rows].sort((a, b) => b.values[sortBy] - a.values[sortBy]);
  const narrow = width < 520;
  const L = narrow ? 128 : 178;
  // On a phone the label column is narrow: the year goes, and a long name is cut (the tooltip and table keep it whole).
  const shown = (s: string) => {
    if (!narrow) return s;
    const t = s.replace(/ d{4}$/, "");
    return t.length > 16 ? `${t.slice(0, 15)}…` : t;
  };
  const R = 16;
  const top = rule ? 22 : 8;
  const rowH = narrow ? 24 : 26;
  const plotH = sorted.length * rowH;
  const H = top + plotH + (band ? 62 : 46);
  const [d0, d1] = domain;
  const t = (v: number) => (log ? Math.log(v) : v);
  const x = (v: number) => L + ((t(Math.min(d1, Math.max(d0, v))) - t(d0)) / (t(d1) - t(d0))) * (width - L - R);
  return (
    <ChartFrame label={label}>
      <Legend items={series} />
      <div ref={box} className="relative" onMouseLeave={() => setTip(null)}>
        <svg className="plot" width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden="true">
          {band && <rect className="band" x={x(band[0])} y={top} width={x(band[1]) - x(band[0])} height={plotH} />}
          {ticks.map((v) => (
            <g key={v}>
              <line className="grid" x1={x(v)} x2={x(v)} y1={top} y2={top + plotH} />
              <text x={x(v)} y={top + plotH + 16} textAnchor="middle">{tick(v)}</text>
            </g>
          ))}
          {rule && (
            <g>
              <line className="rule" x1={x(rule[0])} x2={x(rule[0])} y1={top - 4} y2={top + plotH} />
              <text x={x(rule[0]) + 4} y={top - 8}>{rule[1]}</text>
            </g>
          )}
          {band && (
            <text x={(x(band[0]) + x(band[1])) / 2} y={top + plotH + 32} textAnchor="middle">{band[2]}</text>
          )}
          <text x={(L + width - R) / 2} y={H - 2} textAnchor="middle">{axis}</text>
          {sorted.map((r, i) => {
            const y = top + i * rowH + rowH / 2;
            const xs = series.map((s) => x(r.values[s.key]));
            const show = (s: Series<K>) =>
              setTip({
                x: x(r.values[s.key]),
                y,
                title: `${r.label}${r.starred ? " *" : ""}`,
                lines: series.map((q) => `${q.label}: ${value(r.values[q.key])}`),
              });
            return (
              <g key={r.label}>
                <text className="label" x={L - 10} y={y + 4} textAnchor="end">{shown(r.label)}{r.starred ? " *" : ""}</text>
                <line x1={Math.min(...xs)} x2={Math.max(...xs)} y1={y} y2={y} stroke="#2b3533" strokeWidth={2} />
                {[...series].reverse().map((s) => (
                  <Marker key={s.key} shape={s.shape} x={x(r.values[s.key])} y={y} color={s.color} />
                ))}
                {/* Hit targets bigger than the marks. */}
                {series.map((s) => (
                  <circle key={s.key} className="hit" cx={x(r.values[s.key])} cy={y} r={11} onMouseEnter={() => show(s)} />
                ))}
              </g>
            );
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
      <DataTable
        caption={label}
        head={["", ...series.map((s) => s.label)]}
        rows={sorted.map((r) => [`${r.label}${r.starred ? " *" : ""}`, ...series.map((s) => value(r.values[s.key]))])}
      />
    </ChartFrame>
  );
}
