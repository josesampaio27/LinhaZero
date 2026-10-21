import { SERIES_COLOR } from "@/components/charts/common";

/**
 * How one interval is scored: the fire as observed at t₁ (where the simulation restarts), what really burned by t₂,
 * and what the simulation burned. The miss counts four times the extra burn; the extra burn beyond a held flank
 * does not count at all.
 */
export function IntervalRestart() {
  return (
    <svg viewBox="0 0 640 330" className="w-full min-w-[560px] max-w-[760px]" role="img" aria-labelledby="restart-t">
      <title id="restart-t">
        Um intervalo entre duas observações: a simulação recomeça do fogo observado à primeira hora. A área que ardeu de facto e a simulação não ardeu custa quatro vezes mais do que a área que a simulação ardeu a mais. Para lá de um flanco travado pelos meios, a área a mais não conta.
      </title>
      <defs>
        <pattern id="lz-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke={SERIES_COLOR.orange} strokeWidth="3" />
        </pattern>
        <clipPath id="lz-sim"><path d="M150 165 C150 70 330 40 470 95 C545 125 525 180 445 198 C370 214 310 262 232 250 C178 241 150 207 150 165 Z" /></clipPath>
      </defs>
      {/* What really burned by t₂ (the observed growth), with the miss hatched where the simulation did not reach. */}
      <path d="M200 160 C215 80 360 70 430 110 C500 150 490 230 420 245 C340 265 210 240 200 160 Z" fill="url(#lz-hatch)" />
      {/* The simulation's growth: where it overlaps the real growth, both burned. */}
      <path d="M150 165 C150 70 330 40 470 95 C545 125 525 180 445 198 C370 214 310 262 232 250 C178 241 150 207 150 165 Z" fill="rgb(57 135 229 / .22)" stroke={SERIES_COLOR.blue} strokeWidth={2} />
      <g clipPath="url(#lz-sim)">
        <path d="M200 160 C215 80 360 70 430 110 C500 150 490 230 420 245 C340 265 210 240 200 160 Z" fill="#24548f" />
      </g>
      <path d="M200 160 C215 80 360 70 430 110 C500 150 490 230 420 245 C340 265 210 240 200 160 Z" fill="none" stroke="#e5ebe8" strokeWidth={2} strokeDasharray="0" />
      {/* The fire at t₁: where every simulation of this interval starts. */}
      <ellipse cx={250} cy={165} rx={46} ry={34} fill="#e5ebe8" />
      {/* The held flank: the real fire's edge did not move here. */}
      <path d="M204 140 Q196 165 204 190" fill="none" stroke={SERIES_COLOR.aqua} strokeWidth={6} strokeLinecap="round" />

      <g fontSize="15" fill="#e5ebe8">
        <text x={250} y={170} textAnchor="middle" fill="#111615" fontWeight="500">fogo em t₁</text>
        <line x1={196} y1={176} x2={70} y2={250} stroke="#6b7773" />
        <text x={14} y={268}>flanco travado: a área</text>
        <text x={14} y={287}>a mais para lá dele não conta</text>
        <line x1={360} y1={140} x2={560} y2={42} stroke="#6b7773" />
        <text x={470} y={34}>arderam nos dois</text>
        <line x1={468} y1={225} x2={560} y2={292} stroke="#6b7773" />
        <text x={420} y={312}>faltou à simulação: custa 4×</text>
        <line x1={290} y1={46} x2={322} y2={80} stroke="#6b7773" />
        <text x={250} y={22}>ardeu a mais:</text>
        <text x={250} y={40}>custa 1×</text>
        <text x={14} y={318} fill="#a3afaa" fontSize="13">linha branca: o que ardeu até t₂ · azul: a simulação</text>
      </g>
    </svg>
  );
}

/** The weight of one hectare in the score: a miss costs four times the extra burn. */
export function CoverageWeights() {
  const rows: [string, number, string][] = [
    ["1 hectare que ardeu e a simulação falhou", 0.8, SERIES_COLOR.orange],
    ["1 hectare que a simulação ardeu a mais", 0.2, SERIES_COLOR.blue],
  ];
  return (
    <svg viewBox="0 0 640 120" className="w-full min-w-[480px] max-w-[640px]" role="img" aria-labelledby="weights-t">
      <title id="weights-t">Na pontuação, um hectare que ardeu de facto e a simulação falhou pesa 0,8; um hectare que a simulação ardeu a mais pesa 0,2, quatro vezes menos.</title>
      {rows.map(([label, w, color], i) => (
        <g key={label} transform={`translate(0 ${20 + i * 50})`}>
          <text x={0} y={14} fill="#e5ebe8" fontSize="15">{label}</text>
          <path d={`M0 22h${w * 600 - 4}a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h${-(w * 600 - 4)}z`} fill={color} />
          <text x={w * 600 + 8} y={36} fill="#e5ebe8" fontSize="15">{w.toString().replace(".", ",")}</text>
        </g>
      ))}
    </svg>
  );
}
