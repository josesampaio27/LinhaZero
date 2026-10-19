// Calibrates the Rothermel model on the PT-FireSprd fires (docs/modelo/calibracao-e-validacao.md).
//   python data-prep/build_references.py --ptfs <PT-FireSprd_v0.08>      once: builds the cases
//   npm run calibrate -w engine                                          fit, held-out tests, bootstrap
//   npm run calibrate -w engine -- --quick                               fewer generations and samples
//
// Objective: the interval cost (scripts/intervals.ts) averaged over fires, plus a weak prior towards the
// physical defaults; 7 parameters (calibration-space.ts), fitted by CMA-ES on the tier A fires (fuel map
// of their own year). Reported, never fitted:
//   - held-out fires: 5-fold by fire, leave-one-year-out, Norte left out (the Guimarães region);
//   - tier B fires (2015-2017, fuel map of 2018);
//   - each against the uncalibrated model, the current calibration (PT_CALIBRATION) and "Simples".
// Uncertainty: refits on bootstrap resamples of the fires; the parameter sets are the samples the
// ensemble draws. Writes engine/reports/pt-firesprd-<date>.json.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PT_CALIBRATION } from "../src/calibration";
import type { ModelParams } from "../src/params";
import { createRng } from "../src/random";
import { Pool, type CaseRef } from "./calibration-pool";
import { fromParams, penalty, SPACES, toParams as toSpaceParams } from "./calibration-space";
import { rateSummary } from "./intervals";
import { cmaes } from "./cmaes";
import { FULL_REFERENCE_DIR, REFERENCE_DIR, type MoistureModel, type WeatherSource } from "./reference";

interface ManifestEntry {
  fire: string;
  year: number;
  region: "Norte" | "Centro" | "Sul";
  tier: "A" | "B";
  fit: boolean;
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const quick = flag("quick");
const GENERATIONS = option("generations", quick ? 15 : 60);
const FOLD_GENERATIONS = option("fold-generations", quick ? 10 : 40);
const BOOTSTRAP = option("bootstrap", quick ? 4 : 30);
const BOOT_GENERATIONS = option("boot-generations", quick ? 6 : 20);
const BRIER_RUNS = option("brier-runs", quick ? 6 : 20);
const SEED = option("seed", 1);
const text = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
// Phase E switches: weather series and dead fuel moisture model of the cases.
const WEATHER = text("weather", "era5") as WeatherSource;
const MOISTURE = text("moisture", "nfdrs") as MoistureModel;
const LABEL = text("label", "");
// What is fitted (calibration-space.ts SPACES) and on what: "all" intervals (slow ones at 0.25) or
// "free" (free-running intervals only: the engine simulates an unfought fire, ADR 0057).
const SPACE_NAME = text("space", "groups");
const SPACE = SPACES[SPACE_NAME];
if (!SPACE) throw new Error(`--space desconhecido: ${SPACE_NAME} (${Object.keys(SPACES).join(", ")})`);
const OBJECTIVE = text("objective", "all");
// Parameters held fixed in every evaluated set, e.g. --fixed crownFire=1,crownAdj=0.35
const FIXED: Partial<ModelParams> = Object.fromEntries(
  text("fixed", "")
    .split(",")
    .filter(Boolean)
    .map((kv) => {
      const [k, v] = kv.split("=");
      return [k, Number(v)];
    }),
);
const toParams = (x: number[]): Partial<ModelParams> => ({ ...FIXED, ...toSpaceParams(x, SPACE) });

const manifest: ManifestEntry[] = JSON.parse(
  readFileSync(join(REFERENCE_DIR, "manifest.json"), "utf8"),
).cases;
const entries = manifest.filter((e) => existsSync(join(FULL_REFERENCE_DIR, e.fire, "case.json")));
if (entries.length < manifest.length)
  console.warn(`aviso: ${manifest.length - entries.length} casos do manifesto por construir (build_references.py)`);
const refs: CaseRef[] = entries.map((e) => ({ fire: e.fire, dir: FULL_REFERENCE_DIR }));
const all = entries.map((_, i) => i);
const pool = new Pool(refs, undefined, { weather: WEATHER, moisture: MOISTURE, freeOnly: OBJECTIVE === "free" });
console.log(`tempo ${WEATHER}, humidade ${MOISTURE}, espaço ${SPACE_NAME}, objetivo ${OBJECTIVE}${Object.keys(FIXED).length ? `, fixos ${JSON.stringify(FIXED)}` : ""}`);

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : "—");
const t0 = performance.now();
const elapsed = () => `${((performance.now() - t0) / 60_000).toFixed(1)} min`;

// Reference parameter sets, scored once on every fire.
const UNCALIBRATED: Partial<ModelParams> = {};
const CURRENT = PT_CALIBRATION as Partial<ModelParams>;
console.log(`${entries.length} casos; a pontuar as referências (${elapsed()})`);
const [costUncal, costCurrent, costLegacy] = await Promise.all([
  pool.scores(UNCALIBRATED, all),
  pool.scores(CURRENT, all),
  pool.scores(undefined, all, { metric: "intervals", model: "legacy" }),
]);
// Fires with an interval to score in tier A are fitted; the rest only validate.
const fitSet = all.filter((i) => entries[i].tier === "A" && entries[i].fit && Number.isFinite(costUncal[i]));
const tierB = all.filter((i) => entries[i].tier === "B" && Number.isFinite(costUncal[i]));
console.log(`ajuste em ${fitSet.length} fogos (tier A), validação extra em ${tierB.length} (tier B)`);

/** Fits on `fires` (bootstrap: with multiplicities `weights`), from x0. */
async function fit(fires: number[], generations: number, x0: number[], sigma: number, seed: number, weights?: number[]) {
  const w = weights ?? fires.map(() => 1);
  const wSum = w.reduce((a, b) => a + b, 0);
  return cmaes(
    async (xs) => {
      const costs = await Promise.all(xs.map((x) => pool.scores(toParams(x), fires)));
      return costs.map((c, k) => c.reduce((s, v, j) => s + w[j] * v, 0) / wSum + penalty(xs[k], SPACE));
    },
    x0,
    { sigma, maxGenerations: generations, seed, lambda: 12 },
  );
}

// Every fit starts from the physical defaults, not from the current calibration: that one was fitted on
// some of these fires, and starting there would leak it into the held-out folds (ADR 0058).
const xStart = fromParams({}, SPACE);
const show = (p: Partial<ModelParams>) =>
  SPACE.map((d) => `${d.name} ${(p[d.name] as number).toFixed(d.kind === "log" ? 2 : 3)}`).join(", ");

// 1. The fit on every tier A fire.
console.log(`\n[1] ajuste em todos os fogos tier A (${GENERATIONS} gerações)`);
const best = await fit(fitSet, GENERATIONS, xStart, 0.7, SEED);
const bestParams = toParams(best.x);
console.log(`  J ${f2(best.f)}: ${show(bestParams)} (${elapsed()})`);

// 2. Held-out splits.
interface Split {
  name: string;
  test: number[];
  fitted: Partial<ModelParams>;
}
const rng = createRng(SEED + 100);
const shuffled = [...fitSet].sort(() => rng() - 0.5);
const splits: { name: string; test: number[] }[] = [];
for (let k = 0; k < 5; k++) splits.push({ name: `5-fold ${k + 1}`, test: shuffled.filter((_, i) => i % 5 === k) });
for (const year of [...new Set(fitSet.map((i) => entries[i].year))].sort())
  splits.push({ name: `sem ${year}`, test: fitSet.filter((i) => entries[i].year === year) });
splits.push({ name: "sem Norte", test: fitSet.filter((i) => entries[i].region === "Norte") });

const done: Split[] = [];
console.log(`\n[2] testes com fogos deixados de fora (${FOLD_GENERATIONS} gerações cada)`);
for (const s of splits) {
  const train = fitSet.filter((i) => !s.test.includes(i));
  if (!s.test.length || train.length < 3) continue;
  const r = await fit(train, FOLD_GENERATIONS, xStart, 0.7, SEED + done.length + 1);
  done.push({ ...s, fitted: toParams(r.x) });
  console.log(`  ${s.name.padEnd(12)} ${s.test.length} fogos de teste (${elapsed()})`);
}
const testCost = await Promise.all(done.map((s) => pool.scores(s.fitted, s.test)));
const testCum = await Promise.all(done.map((s) => pool.scores(s.fitted, s.test, { metric: "cumulative" })));
// Free-running physics (ADR 0057): Sørensen at the first observation, and fast / slow spread rates.
type Rates = [number, number, number][];
const ratesOn = (params: Partial<ModelParams> | undefined, fires: number[], model?: "legacy") =>
  Promise.all(fires.map((fire) => pool.runAny<Rates>({ metric: "rates", params, fire, model })));
const testEarly = await Promise.all(done.map((s) => pool.scores(s.fitted, s.test, { metric: "early" })));
const testRates = await Promise.all(done.map((s) => ratesOn(s.fitted, s.test)));
const [earlyUncal, earlyCurrent, earlyLegacy, ratesUncal, ratesCurrent] = await Promise.all([
  pool.scores(UNCALIBRATED, all, { metric: "early" }),
  pool.scores(CURRENT, all, { metric: "early" }),
  pool.scores(undefined, all, { metric: "early", model: "legacy" }),
  ratesOn(UNCALIBRATED, all),
  ratesOn(CURRENT, all),
]);
const [cumUncal, cumCurrent, cumLegacy, cumBest] = await Promise.all([
  pool.scores(UNCALIBRATED, all, { metric: "cumulative" }),
  pool.scores(CURRENT, all, { metric: "cumulative" }),
  pool.scores(undefined, all, { metric: "cumulative", model: "legacy" }),
  pool.scores(bestParams, all, { metric: "cumulative" }),
]);

const rows = done.map((s, k) => ({
  name: s.name,
  fires: s.test.map((i) => entries[i].fire),
  fitted: s.fitted,
  cost: {
    fitted: mean(testCost[k]),
    uncalibrated: mean(s.test.map((i) => costUncal[i])),
    current: mean(s.test.map((i) => costCurrent[i])),
    legacy: mean(s.test.map((i) => costLegacy[i])),
  },
  sorensen: {
    fitted: mean(testCum[k]),
    uncalibrated: mean(s.test.map((i) => cumUncal[i])),
    current: mean(s.test.map((i) => cumCurrent[i])),
    legacy: mean(s.test.map((i) => cumLegacy[i])),
  },
}));
// The five folds together put every tier A fire in a test set exactly once.
const folds = rows.filter((r) => r.name.startsWith("5-fold"));
const pooled = (k: "fitted" | "uncalibrated" | "current" | "legacy", m: "cost" | "sorensen") => {
  const n = folds.reduce((a, r) => a + r.fires.length, 0);
  return folds.reduce((a, r) => a + r[m][k] * r.fires.length, 0) / n;
};
// The current calibration was fitted on these fires (ADR 0053), so it is not held out on them: the fair
// comparison with it uses only the other tier A fires.
const OLD_FIT = new Set(["Alijo_24072019", "Baiao_04092019", "CastroDaire_07092020", "OliveiraFrades_07092020", "SaoJoaoPesqueira_10072020", "Valenca_04092019", "Valpacos_13092019"]);
const foldIdx = done.map((s, k) => [s, k] as const).filter(([s]) => s.name.startsWith("5-fold"));
function pooledOn(keep: (fire: number) => boolean) {
  const per = { cost: { fitted: [] as number[], uncalibrated: [] as number[], current: [] as number[], legacy: [] as number[] }, sorensen: { fitted: [] as number[], uncalibrated: [] as number[], current: [] as number[], legacy: [] as number[] } };
  for (const [s, k] of foldIdx)
    s.test.forEach((i, j) => {
      if (!keep(i)) return;
      per.cost.fitted.push(testCost[k][j]);
      per.cost.uncalibrated.push(costUncal[i]);
      per.cost.current.push(costCurrent[i]);
      per.cost.legacy.push(costLegacy[i]);
      per.sorensen.fitted.push(testCum[k][j]);
      per.sorensen.uncalibrated.push(cumUncal[i]);
      per.sorensen.current.push(cumCurrent[i]);
      per.sorensen.legacy.push(cumLegacy[i]);
    });
  const m = (o: Record<string, number[]>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, mean(v)])) as Record<"fitted" | "uncalibrated" | "current" | "legacy", number>;
  return { fires: per.cost.fitted.length, cost: m(per.cost), sorensen: m(per.sorensen) };
}
const heldOut = {
  cost: { fitted: pooled("fitted", "cost"), uncalibrated: pooled("uncalibrated", "cost"), current: pooled("current", "cost"), legacy: pooled("legacy", "cost") },
  sorensen: { fitted: pooled("fitted", "sorensen"), uncalibrated: pooled("uncalibrated", "sorensen"), current: pooled("current", "sorensen"), legacy: pooled("legacy", "sorensen") },
  /** 5-fold on the tier A fires the current calibration was not fitted on. */
  newFires: pooledOn((i) => !OLD_FIT.has(entries[i].fire)),
};

// 3. Bootstrap: refit on fires drawn with replacement, warm-started from the best fit.
console.log(`\n[3] bootstrap: ${BOOTSTRAP} reajustes (${BOOT_GENERATIONS} gerações cada)`);
const brng = createRng(SEED + 200);
const samples: Partial<ModelParams>[] = [];
for (let b = 0; b < BOOTSTRAP; b++) {
  const counts = new Map<number, number>();
  for (let k = 0; k < fitSet.length; k++) {
    const i = fitSet[Math.floor(brng() * fitSet.length)];
    counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  const fires = [...counts.keys()];
  const r = await fit(fires, BOOT_GENERATIONS, best.x, 0.25, SEED + 300 + b, fires.map((i) => counts.get(i)!));
  samples.push(toParams(r.x));
  if ((b + 1) % 5 === 0 || b === BOOTSTRAP - 1) console.log(`  ${b + 1}/${BOOTSTRAP} (${elapsed()})`);
}

// 4. Tier B and the probabilistic score, with the final parameters.
const brier = (p: Partial<ModelParams>, s?: Partial<ModelParams>[]) =>
  BRIER_RUNS > 0 ? pool.scores(p, fitSet, { metric: "brier", runs: BRIER_RUNS, samples: s }) : Promise.resolve([NaN]);
const [costBestAll, brierBest, brierSamples, brierCurrent] = await Promise.all([
  pool.scores(bestParams, all),
  brier(bestParams),
  brier(bestParams, samples.length ? samples : undefined),
  brier(CURRENT),
]);
await pool.close();
const on = (xs: number[], idx: number[]) => mean(idx.map((i) => xs[i]));

const quantiles = Object.fromEntries(
  SPACE.map((d) => {
    const v = (samples.length ? samples : [bestParams]).map((s) => s[d.name] as number).sort((a, b) => a - b);
    const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    return [d.name, { p05: q(0.05), p50: q(0.5), p95: q(0.95) }];
  }),
);
// Held-out physics on the 5 folds (every tier A fire tested once): early-hours Sørensen and rates.
const physics = (() => {
  const early = { fitted: [] as number[], uncalibrated: [] as number[], current: [] as number[], legacy: [] as number[] };
  const rates = { fitted: [] as Rates, uncalibrated: [] as Rates, current: [] as Rates };
  done.forEach((s, k) => {
    if (!s.name.startsWith("5-fold")) return;
    s.test.forEach((i, j) => {
      early.fitted.push(testEarly[k][j]);
      early.uncalibrated.push(earlyUncal[i]);
      early.current.push(earlyCurrent[i]);
      early.legacy.push(earlyLegacy[i]);
      rates.fitted.push(...testRates[k][j]);
      rates.uncalibrated.push(...ratesUncal[i]);
      rates.current.push(...ratesCurrent[i]);
    });
  });
  const m = (o: Record<string, number[]>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, mean(v)]));
  return {
    early: m(early),
    rates: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, rateSummary(v)])) as Record<
      "fitted" | "uncalibrated" | "current",
      ReturnType<typeof rateSummary>
    >,
  };
})();

// Adoption. Objective "all": better than the current calibration on fires neither has seen, on the
// interval cost and the Sørensen from the ignition. Objective "free" (unfought fire, ADR 0057): better
// free-running cost, fast runs closer to observed, and early-hours Sørensen not worse; whole-fire
// Sørensen is reported but does not decide, since the real fires were fought.
const adopt =
  OBJECTIVE === "free"
    ? heldOut.cost.fitted < heldOut.cost.current &&
      Math.abs(Math.log(physics.rates.fitted.fast.medianRatio)) < Math.abs(Math.log(physics.rates.current.fast.medianRatio)) &&
      physics.early.fitted >= physics.early.current - 0.005
    : heldOut.newFires.cost.fitted < heldOut.newFires.cost.current &&
      heldOut.newFires.sorensen.fitted > heldOut.newFires.sorensen.current;

console.log(`\nParâmetros: ${show(bestParams)}`);
console.log("Intervalo 90% (bootstrap): " + SPACE.map((d) => `${d.name} ${quantiles[d.name].p05.toFixed(2)}–${quantiles[d.name].p95.toFixed(2)}`).join(", "));
console.log("\nCusto por intervalo (menor = melhor) e Sørensen acumulado em fogos de teste:");
console.log("Teste         fogos   ajustado  sem calib.  calib. atual  Simples   |  Sørensen: ajustado  sem calib.  atual  Simples");
for (const r of rows)
  console.log(
    `${r.name.padEnd(13)} ${String(r.fires.length).padStart(5)}   ${f2(r.cost.fitted).padStart(8)}  ${f2(r.cost.uncalibrated).padStart(10)}  ${f2(r.cost.current).padStart(12)}  ${f2(r.cost.legacy).padStart(7)}   |  ` +
      `${f2(r.sorensen.fitted).padStart(18)}  ${f2(r.sorensen.uncalibrated).padStart(10)}  ${f2(r.sorensen.current).padStart(5)}  ${f2(r.sorensen.legacy).padStart(7)}`,
  );
console.log(`5-fold juntos: custo ${f2(heldOut.cost.fitted)} (atual ${f2(heldOut.cost.current)}), Sørensen ${f2(heldOut.sorensen.fitted)} (atual ${f2(heldOut.sorensen.current)})`);
const nf = heldOut.newFires;
console.log(
  `5-fold nos ${nf.fires} fogos que a calibração atual não viu: custo ${f2(nf.cost.fitted)} (sem calib. ${f2(nf.cost.uncalibrated)}, atual ${f2(nf.cost.current)}, Simples ${f2(nf.cost.legacy)}), ` +
    `Sørensen ${f2(nf.sorensen.fitted)} (sem calib. ${f2(nf.sorensen.uncalibrated)}, atual ${f2(nf.sorensen.current)}, Simples ${f2(nf.sorensen.legacy)})`,
);
const rs = (r: ReturnType<typeof rateSummary>) =>
  `rápidas ${f2(r.fast.medianRatio)} (${Math.round(r.fast.within15 * 100)}% a ±50%, n=${r.fast.n}), lentas ${f2(r.slow.medianRatio)} (n=${r.slow.n})`;
console.log("\nFísica nos fogos de teste (5 partes), velocidade simulada / observada (1 = certo):");
console.log(`  ajustado:        Sørensen na 1.ª observação ${f2(physics.early.fitted)}; ${rs(physics.rates.fitted)}`);
console.log(`  sem calibração:  Sørensen na 1.ª observação ${f2(physics.early.uncalibrated)}; ${rs(physics.rates.uncalibrated)}`);
console.log(`  calib. atual:    Sørensen na 1.ª observação ${f2(physics.early.current)}; ${rs(physics.rates.current)}`);
console.log(`  Simples:         Sørensen na 1.ª observação ${f2(physics.early.legacy)}`);
console.log(
  `Tier B (${tierB.length} fogos, só validação): custo ${f2(on(costBestAll, tierB))} (sem calib. ${f2(on(costUncal, tierB))}, atual ${f2(on(costCurrent, tierB))}, Simples ${f2(on(costLegacy, tierB))}); ` +
    `Sørensen ${f2(on(cumBest, tierB))} (atual ${f2(on(cumCurrent, tierB))})`,
);
console.log(`Brier (${BRIER_RUNS} realizações, tier A): só o melhor ${f2(mean(brierBest))}, com as amostras ${f2(mean(brierSamples))}, calib. atual ${f2(mean(brierCurrent))}`);
console.log(adopt ? "\nADOTAR: melhor que a calibração atual nos fogos que nenhuma viu." : "\nNÃO ADOTAR: não melhora a calibração atual nos fogos que nenhuma viu.");

const date = new Date().toISOString().slice(0, 10);
const id = `pt-firesprd-${date}`;
const git = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "?";
  }
})();
const round = (p: Partial<ModelParams>) =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Math.round((v as number) * 10_000) / 10_000]));
const out = {
  id,
  created: date,
  git,
  adopt,
  objective: "mean over fires of the weighted interval cost (1 − Sørensen of new cells + 0.5 |log growth ratio|), plus 0.01 Σ x² prior",
  space: SPACE_NAME,
  intervals: OBJECTIVE === "free" ? "free-running only" : "all, slow at 0.25",
  fixed: FIXED,
  physics,
  settings: { generations: GENERATIONS, foldGenerations: FOLD_GENERATIONS, bootstrap: BOOTSTRAP, bootGenerations: BOOT_GENERATIONS, seed: SEED, weather: WEATHER, moisture: MOISTURE },
  best: round(bestParams),
  bestObjective: best.f,
  samples: samples.map(round),
  quantiles,
  heldOut,
  splits: rows.map((r) => ({ ...r, fitted: round(r.fitted) })),
  tierB: {
    fires: tierB.map((i) => entries[i].fire),
    cost: { fitted: on(costBestAll, tierB), uncalibrated: on(costUncal, tierB), current: on(costCurrent, tierB), legacy: on(costLegacy, tierB) },
    sorensen: { fitted: on(cumBest, tierB), uncalibrated: on(cumUncal, tierB), current: on(cumCurrent, tierB), legacy: on(cumLegacy, tierB) },
  },
  brier: { runs: BRIER_RUNS, best: mean(brierBest), samples: mean(brierSamples), current: mean(brierCurrent) },
  perFire: entries.map((e, i) => ({
    fire: e.fire,
    tier: e.tier,
    fitted: fitSet.includes(i),
    cost: { best: costBestAll[i], uncalibrated: costUncal[i], current: costCurrent[i], legacy: costLegacy[i] },
    sorensen: { best: cumBest[i], uncalibrated: cumUncal[i], current: cumCurrent[i], legacy: cumLegacy[i] },
  })),
};
// Experiments (--quick, or a --label) go to data-prep/out; only a full default run is a calibration.
const experiment = quick || LABEL !== "";
const outDir = join(import.meta.dirname, experiment ? "../../data-prep/out/calibration" : "../reports");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${id}${quick ? "-quick" : ""}${LABEL ? `-${LABEL}` : ""}.json`);
writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
if (!experiment) {
  // The part the engine loads (src/calibration.ts), as a module so no bundler needs JSON imports.
  const mod = join(outDir, `${id}.ts`);
  writeFileSync(
    mod,
    `// Generated by engine/scripts/calibrate.ts on ${date} (git ${git}); the full report is ${id}.json.\n` +
      `import type { ModelParams } from "../params";\n\n` +
      `export const id = ${JSON.stringify(id)};\n` +
      `/** Best fit on every tier A fire. */\n` +
      `export const best: Partial<ModelParams> = ${JSON.stringify(round(bestParams))};\n` +
      `/** Bootstrap refits: the calibration uncertainty, drawn by the ensemble. */\n` +
      `export const samples: Partial<ModelParams>[] = ${JSON.stringify(samples.map(round), null, 1)};\n`,
  );
  console.log(`Módulo para o motor: ${mod}`);
}
console.log(`\nEscrito em ${outPath} (${elapsed()})`);
