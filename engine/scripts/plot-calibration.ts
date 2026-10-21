// Charts of a coverage calibration report (ADR 0068/0069) for the docs, as SVG (no dependencies; GitHub
// renders them in the markdown).
//   tsx scripts/plot-calibration.ts <report.json> <out-prefix> [--grid "100 m"]
// Writes <out-prefix>-cobertura.svg (per held-out fire, the share of the real burned area the simulation
// also burns, from the ignition), <out-prefix>-area.svg (simulated over real burned area, log scale, with
// the band firefighting can explain) and <out-prefix>-parametros.svg (best fit and 90% bootstrap
// interval of each factor, against the physical value and the incumbent).
// Colours: the dataviz reference palette, slots 1-3 (validated all-pairs on the light surface); each
// series also has its own marker shape, and the docs carry the numbers as a table.
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const [reportPath, prefix] = args;
if (!reportPath || !prefix) throw new Error("uso: plot-calibration.ts <relatório.json> <prefixo> [--grid \"100 m\"]");
const gi = args.indexOf("--grid");
const GRID = gi >= 0 ? args[gi + 1] : "100 m";

interface Parts {
  recall: number;
  areaRatio: number;
  mixed: number;
}
interface Row {
  fire: string;
  seen: boolean;
  fitted: Parts;
  current: Parts;
  physical: Parts;
}
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const rows: Row[] = report.coverage?.perFire;
if (!rows?.length) throw new Error("o relatório não tem a pontuação de cobertura (--objective coverage ou coverageMixed)");

const C = {
  surface: "#fcfcfb",
  text: "#0b0b0b",
  text2: "#52514e",
  grid: "#e7e6e2",
  band: "#f0efec",
  rule: "#8f8e88",
  fitted: "#2a78d6",
  current: "#eb6834",
  physical: "#1baf7a",
};
type Key = "fitted" | "current" | "physical";
const SERIES: { key: Key; label: string; shape: "circle" | "diamond" | "square" }[] = [
  { key: "fitted", label: "Ajuste novo (fogos de teste)", shape: "circle" },
  { key: "current", label: "Valores em uso", shape: "diamond" },
  { key: "physical", label: "Modelo físico", shape: "square" },
];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const f2 = (v: number) => v.toFixed(2).replace(".", ",");
const FONT = `font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"`;
const marker = (shape: string, x: number, y: number, color: string, r = 4.5) => {
  const ring = `stroke="${C.surface}" stroke-width="2"`;
  if (shape === "circle") return `<circle cx="${x.toFixed(1)}" cy="${y}" r="${r}" fill="${color}" ${ring}/>`;
  if (shape === "square") return `<rect x="${(x - r).toFixed(1)}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="1" fill="${color}" ${ring}/>`;
  const d = r * 1.25;
  return `<path d="M${x.toFixed(1)} ${y - d}L${(x + d).toFixed(1)} ${y}L${x.toFixed(1)} ${y + d}L${(x - d).toFixed(1)} ${y}Z" fill="${color}" ${ring}/>`;
};
const legend = (x: number, y: number, items: { label: string; shape: string; color: string }[]) => {
  let out = "",
    cx = x;
  for (const it of items) {
    out += marker(it.shape, cx + 5, y - 4, it.color) + `<text x="${cx + 15}" y="${y}" font-size="12" fill="${C.text2}" ${FONT}>${esc(it.label)}</text>`;
    cx += 22 + it.label.length * 6.6;
  }
  return out;
};
const svg = (w: number, h: number, title: string, desc: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="t d">` +
  `<title id="t">${esc(title)}</title><desc id="d">${esc(desc)}</desc>` +
  `<rect width="${w}" height="${h}" fill="${C.surface}"/>${body}</svg>\n`;
/** The subtitle, in lines of at most ~105 characters. */
const subtitle = (text: string, y: number) => {
  const lines: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    if ((line + " " + w).trim().length > 105) {
      lines.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  lines.push(line);
  return lines.map((l, i) => `<text x="20" y="${y + i * 16}" font-size="12" fill="${C.text2}" ${FONT}>${esc(l)}</text>`).join("");
};
// Place names as written in Portuguese (the case folders drop accents and spaces).
const PLACES: Record<string, string> = {
  Agueda: "Águeda",
  Alijo: "Alijó",
  Baiao: "Baião",
  CasteloBranco: "Castelo Branco",
  CastroDaire: "Castro Daire",
  CastroMarim: "Castro Marim",
  Fundao: "Fundão",
  IdanhaaNova: "Idanha-a-Nova",
  MirandadoCorvo: "Miranda do Corvo",
  OliveiraFrades: "Oliveira de Frades",
  PortoMos: "Porto de Mós",
  ProencaaNova: "Proença-a-Nova",
  SaoJoaoPesqueira: "São João da Pesqueira",
  Serta: "Sertã",
  Valenca: "Valença",
  Valpacos: "Valpaços",
  ViladeRei: "Vila de Rei",
};
const name = (fire: string) => {
  const [place, date] = fire.split("_");
  return `${PLACES[place] ?? place.replace(/([a-z])([A-Z])/g, "$1 $2")} ${date?.slice(-4) ?? ""}`;
};

/** One row per fire, one marker per series, on a linear or log x axis. */
function dotPlot(opts: {
  file: string;
  title: string;
  subtitle: string;
  value: (r: Row, k: Key) => number;
  domain: [number, number];
  log?: boolean;
  ticks: number[];
  tickLabel: (v: number) => string;
  band?: [number, number, string];
  rule?: [number, string];
  axisLabel: string;
}) {
  const sorted = [...rows].sort((a, b) => opts.value(b, "fitted") - opts.value(a, "fitted"));
  const W = 780,
    L = 190,
    R = 30,
    top = 104,
    rowH = 22,
    H = top + sorted.length * rowH + 58;
  const [d0, d1] = opts.domain;
  const t = (v: number) => (opts.log ? Math.log(v) : v);
  const x = (v: number) => L + ((t(Math.min(d1, Math.max(d0, v))) - t(d0)) / (t(d1) - t(d0))) * (W - L - R);
  let b = `<text x="20" y="26" font-size="15" font-weight="600" fill="${C.text}" ${FONT}>${esc(opts.title)}</text>`;
  b += subtitle(opts.subtitle, 45);
  b += legend(L, 84, SERIES.map((s) => ({ label: s.label, shape: s.shape, color: C[s.key] })));
  const y0 = top,
    y1 = top + sorted.length * rowH;
  if (opts.band) {
    const [a, c, label] = opts.band;
    b += `<rect x="${x(a)}" y="${y0}" width="${x(c) - x(a)}" height="${y1 - y0}" fill="${C.band}"/>`;
    b += `<text x="${(x(a) + x(c)) / 2}" y="${y1 + 14}" font-size="11" fill="${C.text2}" text-anchor="middle" ${FONT}>${esc(label)}</text>`;
  }
  for (const v of opts.ticks) {
    b += `<line x1="${x(v)}" x2="${x(v)}" y1="${y0}" y2="${y1}" stroke="${C.grid}" stroke-width="1"/>`;
    b += `<text x="${x(v)}" y="${y1 + 30}" font-size="11" fill="${C.text2}" text-anchor="middle" ${FONT}>${opts.tickLabel(v)}</text>`;
  }
  if (opts.rule) {
    b += `<line x1="${x(opts.rule[0])}" x2="${x(opts.rule[0])}" y1="${y0 - 4}" y2="${y1}" stroke="${C.rule}" stroke-width="1"/>`;
    b += `<text x="${x(opts.rule[0]) + 4}" y="${y0 - 6}" font-size="11" fill="${C.text2}" ${FONT}>${esc(opts.rule[1])}</text>`;
  }
  sorted.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2;
    b += `<text x="${L - 10}" y="${y + 4}" font-size="12" fill="${C.text}" text-anchor="end" ${FONT}>${esc(name(r.fire))}${r.seen ? " *" : ""}</text>`;
    const vs = SERIES.map((s) => x(opts.value(r, s.key)));
    b += `<line x1="${Math.min(...vs)}" x2="${Math.max(...vs)}" y1="${y}" y2="${y}" stroke="${C.grid}" stroke-width="2"/>`;
    // Drawn physical, current, fitted: the new fit on top.
    for (const s of [...SERIES].reverse()) b += marker(s.shape, x(opts.value(r, s.key)), y, C[s.key]);
  });
  b += `<text x="${(L + W - R) / 2}" y="${y1 + 48}" font-size="12" fill="${C.text2}" text-anchor="middle" ${FONT}>${esc(opts.axisLabel)}</text>`;
  b += `<text x="20" y="${y1 + 48}" font-size="11" fill="${C.text2}" ${FONT}>* ajustado nos valores em uso</text>`;
  writeFileSync(opts.file, svg(W, H, opts.title, opts.subtitle, b));
}

dotPlot({
  file: `${prefix}-cobertura.svg`,
  title: `Quanto do fogo real a simulação cobre (grelha de ${GRID})`,
  subtitle: "Por incêndio de teste, desde a ignição: média nas horas observadas da fração da área ardida real que a simulação também arde",
  value: (r, k) => r[k].recall,
  domain: [0, 1],
  ticks: [0, 0.2, 0.4, 0.6, 0.8, 1],
  tickLabel: (v) => `${Math.round(v * 100)}%`,
  axisLabel: "Cobertura da área ardida real (mais = melhor)",
});
dotPlot({
  file: `${prefix}-area.svg`,
  title: `Área simulada contra a área real (grelha de ${GRID})`,
  subtitle: "Por incêndio de teste, na última observação. O motor não tem combate: arder mais do que o fogo real é esperado onde os meios o travaram",
  value: (r, k) => r[k].areaRatio,
  domain: [0.05, 20],
  log: true,
  ticks: [0.1, 0.3, 1, 3, 10],
  tickLabel: (v) => `×${String(v).replace(".", ",")}`,
  band: [1, 3, "até 3 vezes: o combate pode explicar"],
  rule: [1, "a área real"],
  axisLabel: "Área simulada / área real (escala logarítmica)",
});

// Parameters: best fit with its 90% bootstrap interval, the physical value (1) and the incumbent.
const PARAMS: [string, string][] = [
  ["rosAdjUnderstory", "Velocidade: sub-bosque"],
  ["rosAdjShrub", "Velocidade: matos"],
  ["rosAdjGrass", "Velocidade: herbáceas"],
  ["windAdj", "Vento a meia chama"],
  ["holdWidthPerFlame", "Linhas: largura que segura (× chama)"],
  ["crownAdj", "Velocidade do fogo de copas"],
];
const inc = report.adoption.incumbentParams as Record<string, number>;
const incumbentOf = (k: string) => {
  const r = inc.rosAdj ?? 1;
  if (k.startsWith("rosAdj")) return r * (inc[k] ?? 1);
  return inc[k] ?? 1;
};
{
  const W = 780,
    L = 260,
    R = 30,
    top = 84,
    rowH = 34,
    H = top + PARAMS.length * rowH + 50;
  const [d0, d1] = [0.2, 6];
  const x = (v: number) => L + ((Math.log(Math.min(d1, Math.max(d0, v))) - Math.log(d0)) / (Math.log(d1) - Math.log(d0))) * (W - L - R);
  const y1 = top + PARAMS.length * rowH;
  let b = `<text x="20" y="26" font-size="15" font-weight="600" fill="${C.text}" ${FONT}>Fatores de calibração (grelha de ${GRID})</text>`;
  b += `<text x="20" y="45" font-size="12" fill="${C.text2}" ${FONT}>Melhor ajuste e intervalo de 90% de ${report.samples.length} reajustes bootstrap; 1 = o valor físico</text>`;
  b += legend(L, 68, [
    { label: "Ajuste novo, com o intervalo de 90%", shape: "circle", color: C.fitted },
    { label: "Valores em uso", shape: "diamond", color: C.current },
  ]);
  for (const v of [0.25, 0.5, 1, 2, 4]) {
    b += `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${y1}" stroke="${v === 1 ? C.rule : C.grid}" stroke-width="1"/>`;
    b += `<text x="${x(v)}" y="${y1 + 18}" font-size="11" fill="${C.text2}" text-anchor="middle" ${FONT}>×${String(v).replace(".", ",")}</text>`;
  }
  b += `<text x="${x(1) + 4}" y="${top - 4}" font-size="11" fill="${C.text2}" ${FONT}>físico</text>`;
  PARAMS.forEach(([k, label], i) => {
    const y = top + i * rowH + rowH / 2;
    const q = report.quantiles[k];
    b += `<text x="${L - 12}" y="${y + 4}" font-size="12" fill="${C.text}" text-anchor="end" ${FONT}>${esc(label)}</text>`;
    if (q) b += `<line x1="${x(q.p05)}" x2="${x(q.p95)}" y1="${y}" y2="${y}" stroke="${C.fitted}" stroke-width="2" stroke-linecap="round"/>`;
    b += marker("diamond", x(incumbentOf(k)), y, C.current);
    b += marker("circle", x(report.best[k]), y, C.fitted);
    b += `<text x="${x(report.best[k])}" y="${y - 9}" font-size="11" fill="${C.text2}" text-anchor="middle" ${FONT}>${f2(report.best[k])}</text>`;
  });
  b += `<text x="${(L + W - R) / 2}" y="${y1 + 38}" font-size="12" fill="${C.text2}" text-anchor="middle" ${FONT}>Fator (escala logarítmica)</text>`;
  writeFileSync(`${prefix}-parametros.svg`, svg(W, H, `Fatores de calibração (grelha de ${GRID})`, "Melhor ajuste e intervalo bootstrap de cada fator", b));
}
console.log(`Escrito: ${prefix}-cobertura.svg, ${prefix}-area.svg, ${prefix}-parametros.svg`);
