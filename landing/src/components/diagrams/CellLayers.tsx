/**
 * One cell of the grid as a stack of the layers it holds, each drawn as a tilted plane with a small sample of what
 * it stores, and named beside it.
 */
const LAYERS: { name: string; what: string; cells: string[] }[] = [
  { name: "Combustível", what: "o tipo de vegetação (FUMOD)", cells: ["#6a8f3a", "#8aa64a", "#c8b45a", "#6a8f3a", "#3f6b3a", "#8aa64a", "#c8b45a", "#3f6b3a", "#6a8f3a"] },
  { name: "Relevo", what: "a altitude, para o declive (Copernicus)", cells: ["#3b4a46", "#4d5e59", "#61736d", "#4d5e59", "#61736d", "#788b84", "#61736d", "#788b84", "#90a39c"] },
  { name: "Coberto arbóreo", what: "a fração com copas de árvores", cells: ["#1f3b2c", "#2e5a3f", "#1f3b2c", "#2e5a3f", "#3f7a52", "#2e5a3f", "#1f3b2c", "#2e5a3f", "#3f7a52"] },
  { name: "Estradas e rios", what: "com a largura em metros (OpenStreetMap)", cells: ["#192120", "#192120", "#d9d2c3", "#192120", "#d9d2c3", "#192120", "#d9d2c3", "#192120", "#192120"] },
  { name: "Edifícios", what: "quantos há na célula", cells: ["#192120", "#e5ebe8", "#192120", "#192120", "#192120", "#e5ebe8", "#e5ebe8", "#192120", "#192120"] },
  { name: "Lugar", what: "a aldeia mais próxima, para dizer a hora", cells: ["#2a3836", "#2a3836", "#2a3836", "#354543", "#354543", "#354543", "#2a3836", "#2a3836", "#2a3836"] },
];

export function CellLayers() {
  const w = 150, h = 54, gapY = 44, x0 = 30, y0 = 34;
  // A plane as a parallelogram: skewed so the stack reads as layers seen from above and to the side.
  const plane = (y: number) => `M${x0 + 40} ${y} h${w} l-40 ${h} h${-w} z`;
  return (
    <svg viewBox="0 0 640 340" className="w-full min-w-[520px] max-w-[700px]" role="img" aria-labelledby="layers-t">
      <title id="layers-t">Cada célula da grelha guarda seis camadas: combustível, relevo, coberto arbóreo, estradas e rios com a largura, edifícios e o lugar mais próximo.</title>
      {LAYERS.map((l, i) => {
        const y = y0 + i * gapY;
        return (
          <g key={l.name}>
            <path d={plane(y)} fill="#192120" stroke="#3a4644" />
            {l.cells.map((col, k) => {
              const r = Math.floor(k / 3), cIdx = k % 3;
              const cw = w / 3, ch = h / 3;
              const sx = x0 + 40 + cIdx * cw - (40 * r * ch) / h;
              const sy = y + r * ch;
              return <path key={k} d={`M${sx} ${sy} h${cw} l${-40 * (ch / h)} ${ch} h${-cw} z`} fill={col} stroke="#111615" strokeWidth={1} />;
            })}
            <line x1={x0 + w + 46} y1={y + h / 2} x2={262} y2={y + h / 2} stroke="#3a4644" />
            <text x={270} y={y + h / 2 - 2} fill="#e5ebe8" fontSize="17" fontWeight="500">{l.name}</text>
            <text x={270} y={y + h / 2 + 17} fill="#a3afaa" fontSize="14">{l.what}</text>
          </g>
        );
      })}
    </svg>
  );
}
