import { useState } from "react";
import { ChartFrame, DataTable, Legend, num, SERIES_COLOR, Tooltip, useWidth, type Tip } from "./common";

export interface WinRow {
  fire: string;
  /** Overlap with what burned (Sørensen) of the two models. */
  calibrated: number;
  simple: number;
}

/**
 * One bar per fire: how much the calibrated engine beats the retired simple model (overlap with what burned,
 * calibrated minus simple), sorted. Above the line the engine is better; the count of bars above is the "N of M"
 * the sentence beside it states.
 */
export function WinsBars({ label, rows }: { label: string; rows: WinRow[] }) {
  const [box, width] = useWidth<HTMLDivElement>(460);
  const [tip, setTip] = useState<Tip | null>(null);
  const sorted = [...rows].map((r) => ({ ...r, d: r.calibrated - r.simple })).sort((a, b) => b.d - a.d);
  const L = 34;
  const R = 4;
  const H = 200;
  const top = 8;
  const bottom = 30;
  // The axis covers every bar, in steps of 0.2.
  const d1 = Math.max(0.2, Math.ceil(Math.max(...sorted.map((r) => r.d)) / 0.2) * 0.2);
  const d0 = Math.min(-0.2, Math.floor(Math.min(...sorted.map((r) => r.d)) / 0.2) * 0.2);
  const ticks = Array.from({ length: Math.round((d1 - d0) / 0.2) + 1 }, (_, k) => Math.round((d0 + k * 0.2) * 10) / 10);
  const y = (v: number) => top + ((d1 - v) / (d1 - d0)) * (H - top - bottom);
  const slot = (width - L - R) / sorted.length;
  const bar = Math.max(3, Math.min(18, slot - 2));
  const wins = sorted.filter((r) => r.d > 0).length;
  return (
    <ChartFrame label={label}>
      <Legend
        items={[
          { label: `LinhaZero melhor (${wins})`, color: SERIES_COLOR.blue, shape: "square" },
          { label: `Modelo simples melhor (${sorted.length - wins})`, color: SERIES_COLOR.orange, shape: "square" },
        ]}
      />
      <div ref={box} className="relative" onMouseLeave={() => setTip(null)}>
        <svg className="plot" width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden="true">
          {ticks.map((v) => (
            <g key={v}>
              <line className={v === 0 ? "rule" : "grid"} x1={L} x2={width - R} y1={y(v)} y2={y(v)} />
              <text x={L - 6} y={y(v) + 4} textAnchor="end">{v > 0 ? `+${num(v, 1)}` : num(v, 1)}</text>
            </g>
          ))}
          {sorted.map((r, i) => {
            const x = L + i * slot + (slot - bar) / 2;
            const up = r.d >= 0;
            const h = Math.abs(y(r.d) - y(0));
            // A rounded data end (2 px), square at the zero line.
            const rr = Math.min(2, h / 2, bar / 2);
            const d = up
              ? `M${x} ${y(0)}v${-(h - rr)}a${rr} ${rr} 0 0 1 ${rr} ${-rr}h${bar - 2 * rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${h - rr}z`
              : `M${x} ${y(0)}v${h - rr}a${rr} ${rr} 0 0 0 ${rr} ${rr}h${bar - 2 * rr}a${rr} ${rr} 0 0 0 ${rr} ${-rr}v${-(h - rr)}z`;
            return (
              <g key={r.fire}>
                <path d={d} fill={up ? SERIES_COLOR.blue : SERIES_COLOR.orange} />
                <rect
                  className="hit"
                  x={L + i * slot}
                  y={top}
                  width={slot}
                  height={H - top - bottom}
                  onMouseEnter={() =>
                    setTip({ x: x + bar / 2, y: up ? y(r.d) : y(0), title: r.fire, lines: [`LinhaZero ${num(r.calibrated)}`, `modelo simples ${num(r.simple)}`] })
                  }
                />
              </g>
            );
          })}
          <text x={L} y={H - 4}>um incêndio por barra, do maior ganho para a maior perda</text>
        </svg>
        <Tooltip tip={tip} />
      </div>
      <DataTable
        caption={label}
        head={["Incêndio", "LinhaZero", "Modelo simples", "Diferença"]}
        rows={sorted.map((r) => [r.fire, num(r.calibrated), num(r.simple), `${r.d >= 0 ? "+" : "−"}${num(Math.abs(r.d))}`])}
      />
    </ChartFrame>
  );
}
