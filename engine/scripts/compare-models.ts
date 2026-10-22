// Stage B (ADR 0074): does a change of the physics hold up on the real fires, with the calibration in use?
//   npx tsx scripts/compare-models.ts --name m4-shrub --goal fast shrubModel=1
//   npx tsx scripts/compare-models.ts --name m4-both --goal fast shrubModel=1 shapeModel=1
//   npx tsx scripts/compare-models.ts --name m5-ffmc --moisture ffmc     (the hypothesis uses FFMC dead fuel moisture)
// Scores the base (PT_CALIBRATION) and the hypothesis (PT_CALIBRATION + the given params) on the 100 m cases in
// data-prep/out/reference, without random draws, and applies the rule registered in ADR 0074 on the tier A fires
// not used to fit the calibration. Tier B is reported apart. Writes engine/reports/stage-b-<name>.json.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PT_CALIBRATION, PT_CALIBRATION_SEEN } from "../src/calibration";
import type { ModelParams } from "../src/params";
import { createRng } from "../src/random";
import { rateSamples, rateSummary, scoreIntervals, weightedCost } from "./intervals";
import { FULL_REFERENCE_DIR, listCases, loadCase, scoreCase, type MoistureModel } from "./reference";

const args = process.argv.slice(2);
let name = "hypothesis";
let goal = "fit" as "fast" | "fit";
let dir = FULL_REFERENCE_DIR;
let moisture: MoistureModel = "nfdrs";
const option: Partial<ModelParams> = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--name") name = args[++i];
  else if (args[i] === "--goal") goal = args[++i] as typeof goal;
  else if (args[i] === "--set") dir = args[++i];
  else if (args[i] === "--moisture") moisture = args[++i] as MoistureModel;
  else {
    const [k, v] = args[i].split("=");
    option[k as keyof ModelParams] = Number(v);
  }
}
if (!Object.keys(option).length && moisture === "nfdrs") throw new Error("uso: compare-models.ts --name <nome> [--goal fast|fit] chave=valor ...");

interface ManifestCase {
  fire: string;
  tier: "A" | "B";
}
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "../test/reference/manifest.json"), "utf8")) as { cases: ManifestCase[] };
const tierOf = new Map(manifest.cases.map((c) => [c.fire, c.tier]));
const built = new Set(listCases(dir));
const seen = new Set(PT_CALIBRATION_SEEN);
const deciding = manifest.cases.filter((c) => c.tier === "A" && !seen.has(c.fire) && built.has(c.fire)).map((c) => c.fire);
const tierB = manifest.cases.filter((c) => c.tier === "B" && built.has(c.fire)).map((c) => c.fire);

interface FireScore {
  fire: string;
  tier: string;
  S: number;
  C: number;
  rates: [number, number, number][];
}
function score(fire: string, params: Partial<ModelParams>, m: MoistureModel = "nfdrs"): FireScore {
  const c = loadCase(fire, dir);
  const ints = scoreIntervals(c, params, { moisture: m });
  return { fire, tier: tierOf.get(fire) ?? "?", S: scoreCase(c, "rothermel", params, undefined, { moisture: m }).meanSorensen, C: weightedCost(ints), rates: rateSamples(ints) };
}

const base = { ...PT_CALIBRATION };
const hyp = { ...PT_CALIBRATION, ...option };
const t0 = performance.now();
const rows = [...deciding, ...tierB].map((fire, k, all) => {
  const b = score(fire, base);
  const h = score(fire, hyp, moisture);
  console.log(`[${k + 1}/${all.length}] ${fire} (${b.tier}): S ${b.S.toFixed(3)} → ${h.S.toFixed(3)}   C ${b.C.toFixed(3)} → ${h.C.toFixed(3)}`);
  return { fire, tier: b.tier, base: b, hyp: h };
});

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function summary(fires: typeof rows) {
  const fast = (pick: "base" | "hyp") => rateSummary(fires.flatMap((r) => r[pick].rates)).fast;
  const dS = fires.map((r) => r.hyp.S - r.base.S);
  const dC = fires.map((r) => r.hyp.C - r.base.C);
  // Paired bootstrap over the fires: 90% interval of the mean difference.
  const rng = createRng(2035);
  const boot = (d: number[]) => {
    const means = Array.from({ length: 1000 }, () => mean(d.map(() => d[Math.floor(rng() * d.length)]))).sort((a, b) => a - b);
    return [means[50], means[949]];
  };
  return {
    fires: fires.length,
    S: { base: mean(fires.map((r) => r.base.S)), hyp: mean(fires.map((r) => r.hyp.S)), diff: mean(dS), ci90: boot(dS) },
    C: { base: mean(fires.map((r) => r.base.C)), hyp: mean(fires.map((r) => r.hyp.C)), diff: mean(dC), ci90: boot(dC) },
    F: { base: fast("base"), hyp: fast("hyp") },
  };
}
const decidingRows = rows.filter((r) => r.tier === "A");
const sum = summary(decidingRows);
const sumB = tierB.length ? summary(rows.filter((r) => r.tier === "B")) : null;

// The rule of ADR 0074.
const guards = sum.S.diff >= -0.01 && sum.C.diff <= 0.02;
const lnF = (x: number) => Math.abs(Math.log(x));
const target =
  goal === "fast" ? lnF(sum.F.base.medianRatio) - lnF(sum.F.hyp.medianRatio) >= 0.05 : sum.C.diff <= -0.02 || sum.S.diff >= 0.01;
const adopt = guards && target;

const f3 = (v: number) => v.toFixed(3);
console.log(`\n${name}: ${JSON.stringify(option)}${moisture !== "nfdrs" ? `, humidade ${moisture}` : ""}, ${sum.fires} incêndios do tier A fora do ajuste (${((performance.now() - t0) / 60000).toFixed(1)} min)`);
console.log(`  S ${f3(sum.S.base)} → ${f3(sum.S.hyp)}  (Δ ${f3(sum.S.diff)}, 90% [${f3(sum.S.ci90[0])}, ${f3(sum.S.ci90[1])}])`);
console.log(`  C ${f3(sum.C.base)} → ${f3(sum.C.hyp)}  (Δ ${f3(sum.C.diff)}, 90% [${f3(sum.C.ci90[0])}, ${f3(sum.C.ci90[1])}])`);
console.log(`  F ${f3(sum.F.base.medianRatio)} → ${f3(sum.F.hyp.medianRatio)}  (${sum.F.hyp.n} intervalos rápidos)`);
if (sumB) console.log(`  tier B (${sumB.fires}): S ${f3(sumB.S.base)} → ${f3(sumB.S.hyp)}, C ${f3(sumB.C.base)} → ${f3(sumB.C.hyp)}`);
console.log(`  guardas ${guards ? "ok" : "falham"}, objetivo (${goal}) ${target ? "atingido" : "não atingido"}: ${adopt ? "ADOTAR" : "não adotar"}`);

const out = join(import.meta.dirname, `../reports/stage-b-${name}.json`);
writeFileSync(
  out,
  JSON.stringify(
    {
      created: new Date().toISOString().slice(0, 10),
      rule: "ADR 0074",
      option,
      moisture,
      goal,
      calibration: PT_CALIBRATION,
      deciding: sum,
      tierB: sumB,
      adopt,
      perFire: rows.map((r) => ({ fire: r.fire, tier: r.tier, S: [r.base.S, r.hyp.S], C: [r.base.C, r.hyp.C] })),
    },
    null,
    1,
  ) + "\n",
);
console.log(`escrito em ${out}`);
