import { SERIES_COLOR } from "@/components/charts/common";

/** The engine's 32 directions (engine/src/spread-rothermel.ts STENCIL_32): neighbours, knight moves and the (1,3)/(2,3) steps. */
const MOVES: [number, number][] = (() => {
  const base: [number, number][] = [[0, 1], [1, 1], [1, 2], [1, 3], [2, 3]];
  const all = new Set<string>();
  for (const [a, b] of base)
    for (const [p, q] of [[a, b], [b, a]])
      for (const sp of [1, -1]) for (const sq of [1, -1]) all.add(`${p * sp},${q * sq}`);
  return [...all].map((s) => s.split(",").map(Number) as [number, number]);
})();

/**
 * Left: the steps the fire can take from one cell (each step's time comes from the rate of the cells it crosses).
 * Right: what those steps add up to with wind, an ellipse with the ignition near its rear.
 */
export function SpreadStencil() {
  const c = 26; // cell size in the drawing
  const cx = 150, cy = 150;
  return (
    <div className="flex max-w-[760px] flex-wrap items-end gap-x-6 gap-y-4" role="img" aria-labelledby="stencil-t">
      <span id="stencil-t" className="sr-only">À esquerda, as 32 direções em que o fogo pode passar de uma célula para outra. À direita, a elipse que o fogo desenha com vento: a cabeça corre, os flancos menos, a retaguarda quase nada.</span>
      <svg viewBox="0 0 300 300" className="w-full max-w-[300px] sm:w-[42%]" aria-hidden="true">
      {/* The cells around the burning one. */}
      {Array.from({ length: 9 }, (_, i) =>
        Array.from({ length: 9 }, (_, j) => (
          <rect key={`${i}-${j}`} x={cx - 4.5 * c + j * c} y={cy - 4.5 * c + i * c} width={c} height={c} fill="none" stroke="#2b3533" />
        )),
      )}
      {MOVES.map(([dr, dc]) => (
        <g key={`${dr},${dc}`}>
          <line x1={cx} y1={cy} x2={cx + dc * c} y2={cy + dr * c} stroke="#a3afaa" strokeWidth={1.2} />
          <circle cx={cx + dc * c} cy={cy + dr * c} r={3} fill="#e5ebe8" />
        </g>
      ))}
      <rect x={cx - c / 2} y={cy - c / 2} width={c} height={c} fill={SERIES_COLOR.orange} />
      <text x={cx} y={290} textAnchor="middle" fill="#a3afaa" fontSize="15">32 direções a partir de cada célula</text>
      </svg>
      {/* The wind ellipse. */}
      <svg viewBox="0 0 400 260" className="w-full max-w-[420px] sm:w-[52%]" aria-hidden="true">
      <g transform="translate(180 120)">
        <ellipse cx={30} cy={0} rx={120} ry={52} fill="rgb(57 135 229 / .18)" stroke={SERIES_COLOR.blue} strokeWidth={2} />
        <circle cx={-72} cy={0} r={6} fill={SERIES_COLOR.orange} stroke="#111615" strokeWidth={2} />
        <path d="M-150 -95 h70" stroke="#e5ebe8" strokeWidth={2} markerEnd="url(#lz-arrow)" />
        <text x={-150} y={-104} fill="#e5ebe8" fontSize="15">vento</text>
        <text x={155} y={5} fill="#e5ebe8" fontSize="15">cabeça</text>
        <text x={20} y={-62} fill="#a3afaa" fontSize="15" textAnchor="middle">flanco</text>
        <text x={20} y={74} fill="#a3afaa" fontSize="15" textAnchor="middle">flanco</text>
        <text x={-96} y={-12} fill="#a3afaa" fontSize="14" textAnchor="end">ignição</text>
        <text x={-96} y={36} fill="#a3afaa" fontSize="14" textAnchor="end">retaguarda</text>
      </g>
      <text x={200} y={250} textAnchor="middle" fill="#a3afaa" fontSize="15">com vento, uma elipse</text>
      <defs>
        <marker id="lz-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0L10 5L0 10z" fill="#e5ebe8" />
        </marker>
      </defs>
      </svg>
    </div>
  );
}
