import { useState } from "react";
import { ChartFrame, DataTable, Legend, Marker, num, SERIES_COLOR, Tooltip, useWidth, type Tip } from "./common";

export interface FactorRow {
  label: string;
  /** The label on a phone. */
  short: string;
  best: number;
  low: number;
  high: number;
  inUse: number;
}

/**
 * Each calibration factor on one log axis around the physical value (1): the new fit with its 90% bootstrap interval,
 * and the value in use.
 */
export function FactorIntervals({ label, rows, fits }: { label: string; rows: FactorRow[]; fits: number }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const narrow = width < 520;
  const L = narrow ? 92 : 230;
  const R = 16;
  const top = 22;
  const rowH = 40;
  const plotH = rows.length * rowH;
  const H = top + plotH + 40;
  const [d0, d1] = [0.2, 6];
  const x = (v: number) => L + ((Math.log(Math.min(d1, Math.max(d0, v))) - Math.log(d0)) / (Math.log(d1) - Math.log(d0))) * (width - L - R);
  return (
    <ChartFrame label={label}>
      <Legend
        items={[
          { label: `Ajuste novo, com o intervalo de 90% (${fits} reajustes)`, color: SERIES_COLOR.orange, shape: "circle" },
          { label: "Valores em uso", color: SERIES_COLOR.blue, shape: "diamond" },
        ]}
      />
      <div ref={box} className="relative" onMouseLeave={() => setTip(null)}>
        <svg className="plot" width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden="true">
          {[0.25, 0.5, 1, 2, 4].map((v) => (
            <g key={v}>
              <line className={v === 1 ? "rule" : "grid"} x1={x(v)} x2={x(v)} y1={top} y2={top + plotH} />
              <text x={x(v)} y={top + plotH + 16} textAnchor="middle">×{num(v, v < 1 ? 2 : 0).replace(/,?0+$/, "") || "1"}</text>
            </g>
          ))}
          <text x={x(1) + 4} y={top - 8}>físico</text>
          <text x={(L + width - R) / 2} y={H - 2} textAnchor="middle">Fator (escala logarítmica)</text>
          {rows.map((r, i) => {
            const y = top + i * rowH + rowH / 2;
            const show = () =>
              setTip({ x: x(r.best), y, title: r.label, lines: [`ajuste novo: ${num(r.best)} (90%: ${num(r.low)}–${num(r.high)})`, `em uso: ${num(r.inUse)}`] });
            return (
              <g key={r.label}>
                <text className="label" x={L - 12} y={y + 4} textAnchor="end">{narrow ? r.short : r.label}</text>
                <line x1={x(r.low)} x2={x(r.high)} y1={y} y2={y} stroke={SERIES_COLOR.orange} strokeWidth={2} strokeLinecap="round" />
                <Marker shape="diamond" x={x(r.inUse)} y={y} color={SERIES_COLOR.blue} />
                <Marker shape="circle" x={x(r.best)} y={y} color={SERIES_COLOR.orange} />
                <rect className="hit" x={L} y={y - rowH / 2} width={width - L - R} height={rowH} onMouseEnter={show} />
              </g>
            );
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
      <DataTable
        caption={label}
        head={["Fator", "Ajuste novo", "Intervalo de 90%", "Em uso"]}
        rows={rows.map((r) => [r.label, num(r.best), `${num(r.low)}–${num(r.high)}`, num(r.inUse)])}
      />
    </ChartFrame>
  );
}
