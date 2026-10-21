// Speed and exact results of what the calibration scores (ADR 0065, phase A).
//   npx tsx scripts/bench-calibration.ts [--cases <dir>] [--select <selection.json>] [--quick]
//
// Scores three parameter sets (physical, PT_CALIBRATION, the ADR 0064 30 m fit) on every selected fire,
// single-threaded: the interval cost, the Sørensen from the ignition and, on two fires, the ensemble
// tallies the reliability run uses. Prints the time of each part and a SHA-256 of every number, so a
// change meant to be faster only (caches, scheduling) can be checked to give exactly the same results.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BURN_CHANCE_ENSEMBLE, PT_CALIBRATION } from "../src/calibration";
import type { ModelParams } from "../src/params";
import { DEFAULT_ENSEMBLE } from "../src/scenario";
import { ensembleFromIgnition, ensembleIntervals, scoreIntervals, weightedCost } from "./intervals";
import { loadCase, scoreCase } from "./reference";

const args = process.argv.slice(2);
const text = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const CASES = resolve(text("cases", "../data-prep/out/reference-30m"));
const SELECT = resolve(text("select", "reports/selection-30m.json"));
const quick = args.includes("--quick");
const fires: string[] = JSON.parse(readFileSync(SELECT, "utf8")).fit;
const FIT_30M: Partial<ModelParams> = {
  crownFire: 1,
  rosAdjUnderstory: 0.9956,
  rosAdjShrub: 0.7891,
  rosAdjGrass: 0.8213,
  windAdj: 0.8117,
  holdWidthPerFlame: 0.996,
  crownAdj: 0.9963,
};
const SETS: [string, Partial<ModelParams>][] = [
  ["physical", {}],
  ["pt", PT_CALIBRATION as Partial<ModelParams>],
  ["fit30m", FIT_30M],
];
const ENSEMBLE = { ...DEFAULT_ENSEMBLE, ...BURN_CHANCE_ENSEMBLE, runs: quick ? 4 : 10 };
const ENSEMBLE_FIRES = ["Valenca_04092019", "Alijo_24072019"].filter((f) => fires.includes(f));

const cases = (quick ? fires.slice(0, 5) : fires).map((f) => loadCase(f, CASES));
const out: Record<string, unknown> = {};
const time = { intervals: 0, cumulative: 0, ensemble: 0 };
for (const [name, p] of SETS) {
  for (const c of cases) {
    let t = performance.now();
    const iv = scoreIntervals(c, p);
    time.intervals += performance.now() - t;
    t = performance.now();
    const cum = scoreCase(c, "rothermel", p);
    time.cumulative += performance.now() - t;
    // The fields every version has (later ones add more), so the hash compares like with like.
    const kept = iv.map((s) => ({
      fire: s.fire,
      startMin: s.startMin,
      endMin: s.endMin,
      observedNew: s.observedNew,
      simulatedNew: s.simulatedNew,
      sorensen: s.sorensen,
      growthError: s.growthError,
      observedRateMMin: s.observedRateMMin,
      simulatedRateMMin: s.simulatedRateMMin,
      l2RateMMin: s.l2RateMMin,
      freeRunning: s.freeRunning,
      weight: s.weight,
    }));
    out[`${name}|${c.fire}`] = { cost: weightedCost(iv), intervals: kept, sorensen: cum.atObservations };
  }
}
for (const c of cases.filter((c) => ENSEMBLE_FIRES.includes(c.fire))) {
  const t = performance.now();
  out[`ensemble|${c.fire}`] = {
    intervals: ensembleIntervals(c, PT_CALIBRATION as Partial<ModelParams>, ENSEMBLE),
    fromIgnition: ensembleFromIgnition(c, PT_CALIBRATION as Partial<ModelParams>, ENSEMBLE),
  };
  time.ensemble += performance.now() - t;
}
const hash = createHash("sha256").update(JSON.stringify(out)).digest("hex");
const s = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
console.log(`${cases.length} fogos, ${SETS.length} conjuntos de parâmetros`);
console.log(`intervalos ${s(time.intervals)}, desde a ignição ${s(time.cumulative)}, ensemble (${ENSEMBLE_FIRES.length} fogos) ${s(time.ensemble)}`);
console.log(`sha256 ${hash}`);
