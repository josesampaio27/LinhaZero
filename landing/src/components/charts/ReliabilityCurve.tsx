import { useState } from "react";
import { ChartFrame, DataTable, Marker, pct, SERIES_COLOR, Tooltip, useWidth, type Tip } from "./common";

export interface ReliabilityBin {
  predicted: number;
  observed: number;
  n: number;
}

/**
 * The uncertainty map against what burned: for the cells given a share of the 30 runs (across), the share that
 * really burned (up). On the diagonal the map would read as a probability; under it, the map burns more than the
 * fought fires did.
 */
export function ReliabilityCurve({ label, bins }: { label: string; bins: ReliabilityBin[] }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const size = Math.min(width, 520);
  const L = 44;
  const B = 40;
  const P = size - L - 12;
  const x = (v: number) => L + v * P;
  const y = (v: number) => 28 + (1 - v) * P;
  const pts = bins.filter((b) => b.n > 0);
  return (
    <ChartFrame label={label}>
      <div ref={box} className="relative" onMouseLeave={() => setTip(null)}>
        <svg className="plot" width={size} height={P + 28 + B} viewBox={`0 0 ${size} ${P + 28 + B}`} aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line className="grid" x1={x(v)} x2={x(v)} y1={y(1)} y2={y(0)} />
              <line className="grid" x1={x(0)} x2={x(1)} y1={y(v)} y2={y(v)} />
              <text x={x(v)} y={y(0) + 16} textAnchor="middle">{pct(v)}</text>
              <text x={x(0) - 6} y={y(v) + 4} textAnchor="end">{pct(v)}</text>
            </g>
          ))}
          <line className="rule" x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} />
          <text x={x(0.62)} y={y(0.66)} transform={`rotate(-45 ${x(0.62)} ${y(0.66)})`}>se fosse uma probabilidade</text>
          <polyline points={pts.map((b) => `${x(b.predicted)},${y(b.observed)}`).join(" ")} fill="none" stroke={SERIES_COLOR.blue} strokeWidth={2} strokeLinejoin="round" />
          {pts.map((b) => (
            <g key={b.predicted}>
              <Marker shape="circle" x={x(b.predicted)} y={y(b.observed)} color={SERIES_COLOR.blue} />
              <circle
                className="hit"
                cx={x(b.predicted)}
                cy={y(b.observed)}
                r={12}
                onMouseEnter={() => setTip({ x: x(b.predicted), y: y(b.observed), title: `Células com ${pct(b.predicted)} das corridas`, lines: [`arderam de facto: ${pct(b.observed)}`, `${b.n.toLocaleString("pt-PT")} células`] })}
              />
            </g>
          ))}
          <text x={(x(0) + x(1)) / 2} y={P + 28 + B - 4} textAnchor="middle">Fração das 30 corridas em que a célula arde</text>
          <text x={4} y={12}>Fração que ardeu de facto</text>
        </svg>
        <Tooltip tip={tip} />
      </div>
      <DataTable
        caption={label}
        head={["Corridas que ardem", "Arderam de facto", "Células"]}
        rows={pts.map((b) => [pct(b.predicted), pct(b.observed), b.n.toLocaleString("pt-PT")])}
      />
    </ChartFrame>
  );
}
