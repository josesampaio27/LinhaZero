// How trustworthy is the probability map? (docs/modelo/incerteza.md, ADR 0057)
//   npm run reliability -w engine
//
// Runs the app's ensemble (30 runs, calibrated Rothermel) on the tier A fires and compares the burn
// probability with what burned: Brier score, reliability (of the cells given 30%, did 30% burn?) and
// coverage (share of the burned cells the map gave at least 10%). The engine simulates an unfought fire,
// so it is judged where the real fire was least held: the free-running intervals and the first
// observation from the ignition. The perturbation scale (moisture, fuel, ignition; and the wind jitter)
// is chosen by Brier on the training fires of a 5-fold split and judged on the held-out ones, against
// the wind-only ensemble. Writes engine/reports/reliability-<date>.json.
//
// For another grid (30 m): --cases <dir> (its manifest.json), --select <selection.json> (the fit fires),
// --params '<json>' (the calibration of that grid), --extend (one scale beyond the plausibility cap, to
// see whether the Brier turns), --fixed holdSteepness=3 (extra parameters), --label, --outdir.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PT_CALIBRATION } from "../src/calibration";
import { createRng } from "../src/random";
import { DEFAULT_ENSEMBLE } from "../src/scenario";
import type { EnsembleOptions } from "../src/types";
import { defaultJobs, Pool } from "./calibration-pool";
import { addTally, emptyTally, TALLY_BINS, type EnsembleTally } from "./intervals";
import { FULL_REFERENCE_DIR, REFERENCE_DIR } from "./reference";

interface Entry {
  fire: string;
  tier: "A" | "B";
  fit: boolean;
}

/** Base magnitudes, multiplied by the scale s. */
export const BASE_PERTURBATION = { deadMoisturePts: 0.02, fuelLogSd: 0.3, ignitionRadiusM: 200 };
// Capped at physically plausible spreads (scale 2: ±4 points of dead moisture, fuel factor σ 0.6 in
// log, ignition within 400 m; wind ×1.5: ±30° and ±37%). Larger scales keep lowering the Brier only by
// smearing the map, which hides the bias instead of fixing it; the recalibration map fixes the bias.
const args = process.argv.slice(2);
const text = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const EXTEND = args.includes("--extend");
const SCALES = [0, 0.5, 1, 1.5, 2, ...(EXTEND ? [2.5] : [])];
const WIND_SCALES = [1, 1.25, 1.5, ...(EXTEND ? [1.75] : [])];
const CASES = resolve(text("cases", FULL_REFERENCE_DIR));
const SELECT = text("select", "");
const LABEL = text("label", "");
const OUTDIR = text("outdir", "");
const FIXED = Object.fromEntries(
  text("fixed", "")
    .split(",")
    .filter(Boolean)
    .map((kv) => [kv.split("=")[0], Number(kv.split("=")[1])]),
);
const PARAMS = { ...JSON.parse(text("params", JSON.stringify(PT_CALIBRATION))), ...FIXED };

const manifestPath = existsSync(join(CASES, "manifest.json")) ? join(CASES, "manifest.json") : join(REFERENCE_DIR, "manifest.json");
const selection: { fit: string[]; locked?: string[] } | undefined = SELECT ? JSON.parse(readFileSync(SELECT, "utf8")) : undefined;
const entries: Entry[] = (JSON.parse(readFileSync(manifestPath, "utf8")).cases as Entry[]).filter(
  (e) => existsSync(join(CASES, e.fire, "case.json")) && (!selection || selection.fit.includes(e.fire) || (selection.locked ?? []).includes(e.fire)),
);
const fitSet = entries.map((e, i) => [e, i] as const).filter(([e]) => e.tier === "A" && e.fit && (!selection || selection.fit.includes(e.fire))).map(([, i]) => i);
// Validation only: the locked fires of a selection, or every tier B fire.
const tierB = entries
  .map((e, i) => [e, i] as const)
  .filter(([e]) => (selection ? (selection.locked ?? []).includes(e.fire) : e.tier === "B"))
  .map(([, i]) => i);
const pool = new Pool(entries.map((e) => ({ fire: e.fire, dir: CASES })), Number(text("jobs", String(defaultJobs()))));

const configs = WIND_SCALES.flatMap((w) => SCALES.map((s) => ({ s, w })));
const ensembleOf = ({ s, w }: { s: number; w: number }): EnsembleOptions => ({
  ...DEFAULT_ENSEMBLE,
  windDirJitterDeg: 20 * w,
  windSpeedJitterPct: 25 * w,
  perturb:
    s > 0
      ? {
          deadMoisturePts: BASE_PERTURBATION.deadMoisturePts * s,
          fuelLogSd: BASE_PERTURBATION.fuelLogSd * s,
          ignitionRadiusM: BASE_PERTURBATION.ignitionRadiusM * s,
        }
      : undefined,
});
const t0 = performance.now();
const elapsed = () => `${((performance.now() - t0) / 60_000).toFixed(1)} min`;
type Parts = { all: EnsembleTally; free: EnsembleTally; fromIgnition: EnsembleTally; early: EnsembleTally };
const score = (cfg: { s: number; w: number }, fires: number[]) =>
  Promise.all(fires.map((fire) => pool.runAny<Parts>({ metric: "ensemble", params: PARAMS, fire, ensemble: ensembleOf(cfg) })));

console.log(`${configs.length} configurações × ${fitSet.length} fogos tier A`);
const tallies = await Promise.all(configs.map((cfg) => score(cfg, fitSet)));
console.log(`pontuado (${elapsed()})`);

const sum = (ts: EnsembleTally[]) => ts.reduce(addTally, emptyTally());
const brier = (t: EnsembleTally) => t.sqErr / t.cells;
type Part = keyof Parts | "unfought";
// The engine simulates an unfought fire (ADR 0057), so the probability is judged where the real fire
// was least held: the free-running intervals and the first observation from the ignition ("unfought").
// The whole fire from the ignition is reported too: there the map overpredicts, as it should.
const on = (k: number, fires: number[], part: Part = "unfought") =>
  sum(
    fires.flatMap((f) => {
      const t = tallies[k][fitSet.indexOf(f)];
      return part === "unfought" ? [t.free, t.early] : [t[part]];
    }),
  );
const bestOn = (fires: number[]) => configs.map((_, j) => j).sort((a, b) => brier(on(a, fires)) - brier(on(b, fires)))[0];
const WIND_ONLY = configs.findIndex((c) => c.s === 0 && c.w === 1);

// 5-fold: the scale chosen on the training fires, scored on the held-out ones.
const rng = createRng(101);
// Fisher–Yates with the seeded generator (sorting by a random comparator is biased).
const shuffled = [...fitSet];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
const parts: Part[] = ["unfought", "free", "early", "fromIgnition"];
const held = Object.fromEntries(parts.flatMap((p) => [[`${p}WindOnly`, emptyTally()], [`${p}Tuned`, emptyTally()]])) as Record<string, EnsembleTally>;
const chosen: { s: number; w: number }[] = [];
for (let k = 0; k < 5; k++) {
  const test = shuffled.filter((_, i) => i % 5 === k);
  const train = shuffled.filter((_, i) => i % 5 !== k);
  const best = bestOn(train);
  chosen.push(configs[best]);
  for (const p of parts) {
    held[`${p}WindOnly`] = addTally(held[`${p}WindOnly`], on(WIND_ONLY, test, p));
    held[`${p}Tuned`] = addTally(held[`${p}Tuned`], on(best, test, p));
  }
}
// What the app uses: the scale chosen on every tier A fire.
const finalIdx = bestOn(fitSet);
const final = configs[finalIdx];
const [bWind, bTuned] = await Promise.all([score(configs[WIND_ONLY], tierB), score(final, tierB)]);
await pool.close();
const tb = (xs: Parts[]) => sum(xs.flatMap((t) => [t.free, t.early]));

const f3 = (v: number) => v.toFixed(3);
const summary = (t: EnsembleTally) => ({
  brier: brier(t),
  coverage: t.covered / t.observedNew,
  likelyOverObserved: t.likely / t.observedNew,
  reliability: t.bins.map((b) => ({ n: b.n, predicted: b.n ? b.sumP / b.n : null, observed: b.n ? b.sumObs / b.n : null })),
});
const heldOut = Object.fromEntries(Object.entries(held).map(([k, t]) => [k, summary(t)])) as Record<string, ReturnType<typeof summary>>;
const tierBOut = { unfoughtWindOnly: summary(tb(bWind)), unfoughtTuned: summary(tb(bTuned)) };
// Adopt the perturbations if they make the unfought-fire probability better (Brier) without missing
// more of what burned (coverage). No recalibration map: it would fold in the firefighting of the real fires.
const adopt =
  heldOut.unfoughtTuned.brier < heldOut.unfoughtWindOnly.brier && heldOut.unfoughtTuned.coverage >= heldOut.unfoughtWindOnly.coverage;
const out = {
  created: new Date().toISOString().slice(0, 10),
  scoredOn: "free-running intervals + first observation from the ignition (unfought fire, ADR 0057)",
  params: PARAMS,
  cases: CASES,
  selection: selection ?? null,
  base: BASE_PERTURBATION,
  grid: { scales: SCALES, windScales: WIND_SCALES },
  chosenPerFold: chosen,
  final: { ...final, ensemble: ensembleOf(final) },
  heldOut,
  tierB: tierBOut,
  adopt,
  allConfigs: configs.map((c, j) => ({ ...c, brier: brier(on(j, fitSet)), coverage: on(j, fitSet).covered / on(j, fitSet).observedNew })),
};

for (const c of out.allConfigs) console.log(`  escala ${c.s}, vento ×${c.w}: Brier ${f3(c.brier)}, cobertura ${f3(c.coverage)}`);
console.log(`\nEscolhida em cada parte: ${chosen.map((c) => `${c.s}/×${c.w}`).join(", ")}; final ${final.s}/×${final.w}`);
const line = (name: string, h: ReturnType<typeof summary>) =>
  console.log(`  ${name.padEnd(40)} Brier ${f3(h.brier)}  cobertura ${f3(h.coverage)}  área P≥0,5 / observada ${f3(h.likelyOverObserved)}`);
console.log("\nFogos de teste (5 partes): só vento → com perturbações");
for (const [p, label] of [
  ["unfought", "fogo livre (intervalos livres + 1.ª obs.)"],
  ["free", "intervalos livres"],
  ["early", "1.ª observação desde a ignição"],
  ["fromIgnition", "fogo inteiro desde a ignição (combatido)"],
] as const) {
  line(`${label}, só vento`, heldOut[`${p}WindOnly`]);
  line(`${label}, perturbações`, heldOut[`${p}Tuned`]);
}
console.log("Tier B, fogo livre:");
line("só vento", tierBOut.unfoughtWindOnly);
line("com perturbações", tierBOut.unfoughtTuned);
console.log("\n  previsto   observado (fogo livre, fogos de teste): só vento | perturbações   células");
heldOut.unfoughtTuned.reliability.forEach((b, k) => {
  const w = heldOut.unfoughtWindOnly.reliability[k];
  const o = (x: { observed: number | null }) => (x.observed === null ? "  —  " : f3(x.observed));
  console.log(`  ${(k / TALLY_BINS).toFixed(2)}–${((k + 1) / TALLY_BINS).toFixed(2)}  ${o(w)} | ${o(b)}   ${b.n}`);
});
console.log(adopt ? "\nADOTAR as perturbações." : "\nNÃO ADOTAR: ficam só as do vento.");
const dir = OUTDIR ? resolve(OUTDIR) : join(import.meta.dirname, "../reports");
mkdirSync(dir, { recursive: true });
const path = join(dir, `reliability-${LABEL ? `${LABEL}-` : ""}${out.created}.json`);
writeFileSync(path, JSON.stringify(out, null, 1) + "\n");
console.log(`Escrito em ${path} (${elapsed()})`);
