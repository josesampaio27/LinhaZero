// The numbers the landing page shows about the engine (landing/src/pages, ADR 0069), from one run of this script,
// so every figure on the site can be traced and refreshed when the calibration changes.
//   npx tsx scripts/landing-data.ts [--cases ../data-prep/out/reference] [--report reports/pt-firesprd-2026-10-21.json]
// Writes landing/src/data/site-data.json:
//   validation   from the ignition, today's engine, 100 m cases: mean Sørensen over the observed hours for the
//                retired simple model, physical Rothermel and the calibration in use, on the tier A fires;
//                and the control with every hour's wind reversed;
//   coverage     the held-out results of the 100 m recalibration (the report), per fire;
//   levers       the best fit of that report with one factor at a time back at its physical value;
//   reliability  the uncertainty map in use (30 runs) on the selected fires, judged where the fire ran freely;
//   grid         what the Guimarães grid holds (fuels, buildings, places).
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BURN_CHANCE_ENSEMBLE, calibrationFor, PT_CALIBRATION_SEEN } from "../src/calibration";
import { prepareGrid } from "../src/grid";
import { DEFAULT_PARAMS, type ModelParams } from "../src/params";
import { DEFAULT_ENSEMBLE, rothermelEnsemble } from "../src/scenario";
import { defaultJobs, Pool, type CoverageParts } from "./calibration-pool";
import { addTally, emptyTally, type EnsembleTally } from "./intervals";
import { loadGridFromDir } from "./load-grid-node";
import { loadCase, scoreCase } from "./reference";

const args = process.argv.slice(2);
const text = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const CASES = resolve(text("cases", "../data-prep/out/reference"));
const REPORT = resolve(text("report", "reports/pt-firesprd-2026-10-21.json"));
const SELECTION = resolve(text("select", "reports/selection-100m.json"));
const OUT = resolve(text("out", "../landing/src/data/site-data.json"));
const GRID = resolve(text("grid", "../web/public/grids/guimaraes"));

interface Entry {
  fire: string;
  year: number;
  region: string;
  tier: "A" | "B";
}
const manifest: Entry[] = JSON.parse(readFileSync(join(CASES, "manifest.json"), "utf8")).cases;
const tierA = manifest.filter((e) => e.tier === "A" && existsSync(join(CASES, e.fire, "case.json")));
const calibration = calibrationFor(100);
const t0 = performance.now();
const log = (s: string) => console.log(`${s} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

// 1. Validation from the ignition, on every tier A fire.
const pool = new Pool(tierA.map((e) => ({ fire: e.fire, dir: CASES })), defaultJobs());
const idx = tierA.map((_, i) => i);
const [legacy, physical, calibrated] = await Promise.all([
  pool.scores(undefined, idx, { metric: "cumulative", model: "legacy" }),
  pool.scores({}, idx, { metric: "cumulative" }),
  pool.scores(calibration.params, idx, { metric: "cumulative" }),
]);
log("validação desde a ignição");
const setOf = (keep: (e: Entry) => boolean) => {
  const ii = idx.filter((i) => keep(tierA[i]));
  return { fires: ii.length, simple: r3(mean(ii.map((i) => legacy[i]))), physical: r3(mean(ii.map((i) => physical[i]))), calibrated: r3(mean(ii.map((i) => calibrated[i]))) };
};
// Control: with every hour's wind reversed the engine must do clearly worse (the comparison measures something).
const reversed = tierA.map((e) => {
  const c = loadCase(e.fire, CASES);
  const flipped = { ...c, weather: c.weather.map((h) => ({ ...h, windFromDeg: (h.windFromDeg + 180) % 360 })) };
  return scoreCase(flipped, "rothermel", calibration.params).meanSorensen;
});
log("controlo com o vento invertido");
const validation = {
  scope: "Sørensen médio nas horas observadas, desde a ignição observada, com o tempo hora a hora e sem combate; grelha de 100 m",
  sets: {
    all: setOf(() => true),
    norte: setOf((e) => e.region === "Norte"),
    unseen: setOf((e) => !PT_CALIBRATION_SEEN.includes(e.fire)),
  },
  winsOverSimple: idx.filter((i) => calibrated[i] > legacy[i]).length,
  windReversed: r3(mean(reversed)),
  perFire: tierA.map((e, i) => ({ fire: e.fire, year: e.year, region: e.region, simple: r3(legacy[i]), physical: r3(physical[i]), calibrated: r3(calibrated[i]) })),
};

// 2. The 100 m recalibration (ADR 0069), as reported.
const report = JSON.parse(readFileSync(REPORT, "utf8"));
const cov = report.coverage;
const pick = (p: CoverageParts) => ({ recall: r3(p.recall), areaRatio: r3(p.areaRatio), tversky: r3(p.tversky), sorensen: r3(p.sorensen) });
const coverage = {
  report: REPORT.split(/[\\/]/).pop(),
  fires: cov.perFire.length,
  paired: cov.paired,
  pairedUnseen: cov.pairedUnseen,
  heldOut: cov.heldOut,
  perFire: cov.perFire.map((r: { fire: string; seen: boolean; fitted: CoverageParts; current: CoverageParts; physical: CoverageParts }) => ({
    fire: r.fire,
    seen: r.seen,
    fitted: pick(r.fitted),
    current: pick(r.current),
    physical: pick(r.physical),
  })),
  best: report.best,
  quantiles: report.quantiles,
  incumbent: report.adoption.incumbentParams,
  bootstrap: report.samples.length,
  adopted: report.adopt,
};

// 3. Levers: the best fit, one factor back at its physical value at a time, on the selected fires (in-sample).
const selected: string[] = JSON.parse(readFileSync(SELECTION, "utf8")).fit;
const selIdx = selected.map((f) => tierA.findIndex((e) => e.fire === f)).filter((i) => i >= 0);
const best = report.best as Partial<ModelParams>;
const variants: [string, Partial<ModelParams>][] = [
  ["best", best],
  ["windAdj", { ...best, windAdj: DEFAULT_PARAMS.windAdj }],
  ["holdWidthPerFlame", { ...best, holdWidthPerFlame: DEFAULT_PARAMS.holdWidthPerFlame }],
  ["crownAdj", { ...best, crownAdj: DEFAULT_PARAMS.crownAdj }],
];
const leverParts = await Promise.all(
  variants.map(([, p]) => Promise.all(selIdx.map((fire) => pool.runAny<CoverageParts | null>({ metric: "coverageParts", params: p, fire })))),
);
const levers = variants.map(([name], v) => {
  const ok = selIdx.map((_, j) => j).filter((j) => leverParts.every((s) => s[j]));
  return { lever: name, mixed: r3(mean(ok.map((j) => leverParts[v][j]!.mixed))), recall: r3(mean(ok.map((j) => leverParts[v][j]!.recall))) };
});
log("alavancas");

// 4. The uncertainty map in use, where the real fire ran freely (free-running intervals and the first observation).
type Parts = { free: EnsembleTally; early: EnsembleTally };
const ensemble = rothermelEnsemble(DEFAULT_ENSEMBLE, {}, 100);
const tallies = await Promise.all(selIdx.map((fire) => pool.runAny<Parts>({ metric: "ensemble", params: calibration.params, fire, ensemble })));
await pool.close();
log("mapa de cenários");
const t = tallies.reduce((a, x) => addTally(addTally(a, x.free), x.early), emptyTally());
const reliability = {
  runs: ensemble.runs,
  perturbation: BURN_CHANCE_ENSEMBLE,
  fires: selIdx.length,
  brier: r3(t.sqErr / t.cells),
  coverage10: r3(t.covered / t.observedNew),
  bins: t.bins.map((b, k) => ({ from: k / t.bins.length, n: b.n, predicted: b.n ? r3(b.sumP / b.n) : null, observed: b.n ? r3(b.sumObs / b.n) : null })),
};

// 5. The Guimarães grid.
const grid = prepareGrid(loadGridFromDir(GRID));
const n = grid.header.rows * grid.header.cols;
const byFuel = new Map<number, number>();
for (let i = 0; i < n; i++) byFuel.set(grid.fuel[i], (byFuel.get(grid.fuel[i]) ?? 0) + 1);
const gridInfo = {
  cellSize: grid.header.cellSize,
  rows: grid.header.rows,
  cols: grid.header.cols,
  areaKm2: r3((n * grid.header.cellSize ** 2) / 1e6),
  buildings: grid.buildings.reduce((a, b) => a + b, 0),
  places: grid.header.villages.length,
  fuels: [...byFuel]
    .map(([code, k]) => ({ code, label: grid.header.fuelTable[code]?.label ?? String(code), burns: !!grid.header.fuelTable[code]?.rothermel, share: r3(k / n) }))
    .sort((a, b) => b.share - a.share),
};

const git = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "?";
  }
})();
const out = {
  generated: new Date().toISOString().slice(0, 10),
  git,
  calibration: { id: calibration.id, params: calibration.params },
  validation,
  coverage,
  levers,
  reliability,
  grid: gridInfo,
};
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
log(`escrito em ${OUT}`);
