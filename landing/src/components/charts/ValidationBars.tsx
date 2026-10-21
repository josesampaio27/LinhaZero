import { useState } from "react";
import { ChartFrame, DataTable, Legend, num, Tooltip, useWidth, type Series, type Tip } from "./common";

type Model = "simple" | "physical" | "calibrated";
export interface ValidationSet {
  label: string;
  fires: number;
  simple: number;
  physical: number;
  calibrated: number;
}

/**
 * The overlap with what really burned (Sørensen, 0 to 1) for each set of fires, one bar per model on one shared axis:
 * thin bars from a single baseline, the value at the tip.
 */
export function ValidationBars({ label, sets, series }: { label: string; sets: ValidationSet[]; series: Series<Model>[] }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const narrow = width < 520;
  const L = narrow ? 104 : 170;
  const R = 44;
  const bar = 14;
  const gap = 4;
  const groupH = series.length * (bar + gap) + 18;
  const H = sets.length * groupH + 30;
  const x = (v: number) => L + (v / 0.5) * (width - L - R);
  return (
    <ChartFrame label={label}>
      <Legend items={series} />
      <div ref={box} className="relative" onMouseLeave={() => setTip(null)}>
        <svg className="plot" width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden="true">
          {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((v) => (
            <g key={v}>
              <line className="grid" x1={x(v)} x2={x(v)} y1={0} y2={H - 26} />
              <text x={x(v)} y={H - 10} textAnchor="middle">{num(v, 1)}</text>
            </g>
          ))}
          {sets.map((s, g) => {
            const y0 = g * groupH + 6;
            return (
              <g key={s.label}>
                <text className="label" x={L - 10} y={y0 + (series.length * (bar + gap)) / 2 + 2} textAnchor="end">{s.label}</text>
                <text x={L - 10} y={y0 + (series.length * (bar + gap)) / 2 + 17} textAnchor="end">{s.fires} incêndios</text>
                {series.map((m, k) => {
                  const y = y0 + k * (bar + gap);
                  const w = x(s[m.key]) - x(0);
                  // A 4 px rounded data end, square at the baseline.
                  const d = `M${x(0)} ${y}h${w - 4}a4 4 0 0 1 4 4v${bar - 8}a4 4 0 0 1 -4 4h${-(w - 4)}z`;
                  return (
                    <g key={m.key}>
                      <path d={d} fill={m.color} />
                      <text x={x(s[m.key]) + 5} y={y + bar - 3} className="label">{num(s[m.key])}</text>
                      <rect
                        className="hit"
                        x={x(0)}
                        y={y - 2}
                        width={width - L - R + 30}
                        height={bar + 4}
                        onMouseEnter={() => setTip({ x: x(s[m.key]), y, title: `${s.label}: ${m.label}`, lines: [`sobreposição ${num(s[m.key])}`, `${s.fires} incêndios`] })}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
      <DataTable caption={label} head={["Incêndios", ...series.map((m) => m.label)]} rows={sets.map((s) => [`${s.label} (${s.fires})`, ...series.map((m) => num(s[m.key]))])} />
    </ChartFrame>
  );
}
