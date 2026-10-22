import type { Wind } from "@linha-zero/engine";

const POINTS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];

const MS = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 });
/** "6,5 m/s" */
export const msText = (ms: number) => `${MS.format(ms)} m/s`;

export function compassName(deg: number): string {
  return POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** Wind direction (FROM, degrees) and speed (m/s). The compass shows where it blows to; dragging on it sets the direction. */
export function WindControl({ wind, onChange }: { wind: Wind; onChange: (w: Wind) => void }) {
  const drag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = e.currentTarget.getBoundingClientRect();
    const to = (Math.atan2(e.clientX - r.left - r.width / 2, r.top + r.height / 2 - e.clientY) * 180) / Math.PI;
    onChange({ ...wind, directionDeg: Math.round(to + 540) % 360 }); // the arrow points TO, the wind is named FROM
  };
  return (
    <div className="wind">
      <svg viewBox="-50 -50 100 100" className="compass" aria-hidden onPointerDown={drag} onPointerMove={drag}>
        <circle r="46" className="compass-ring" />
        {POINTS.map((p, i) => {
          const a = (i * 45 * Math.PI) / 180;
          return (
            <text key={p} x={38 * Math.sin(a)} y={-38 * Math.cos(a) + 4} textAnchor="middle" className="compass-label">
              {i % 2 === 0 ? p : ""}
            </text>
          );
        })}
        {/* Arrow points to where the wind blows. */}
        <g transform={`rotate(${wind.directionDeg + 180})`}>
          <line x1="0" y1="22" x2="0" y2="-22" className="compass-arrow" />
          <polygon points="0,-30 -8,-16 8,-16" className="compass-head" />
        </g>
      </svg>
      <div className="wind-sliders">
        {/* The degrees and km/h are in the number fields next to the sliders; the labels add the compass point and m/s. */}
        <label>
          Direção: de {compassName(wind.directionDeg)}
          <input
            type="range"
            min={0}
            max={359}
            value={wind.directionDeg}
            aria-valuetext={`de ${compassName(wind.directionDeg)}, ${Math.round(wind.directionDeg)}°`}
            onChange={(e) => onChange({ ...wind, directionDeg: Number(e.target.value) })}
          />
        </label>
        <label>
          Velocidade: {msText(wind.speedMs)}
          <input
            type="range"
            min={0}
            max={20}
            step={0.5}
            value={wind.speedMs}
            aria-valuetext={`${Math.round(wind.speedMs * 3.6)} km/h, ${msText(wind.speedMs)}`}
            onChange={(e) => onChange({ ...wind, speedMs: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}
