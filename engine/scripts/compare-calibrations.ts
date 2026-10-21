// Paired comparison of two calibration reports on the same held-out fires: a structural hypothesis
// against the base (ADR 0064, and ADR 0065 for the coverage score).
//   tsx scripts/compare-calibrations.ts <base.json> <hypothesis.json>
// Both must come from calibrate.ts with the same cases, selection and seed, so the 5 folds are the same
// fires; each fire's held-out score is the one of the fit on the other four folds.
// Interval cost (ADR 0064): the hypothesis replaces the base only if its cost is lower by at least 0.02
// with a 90% bootstrap interval below 0, and the Sørensen from the ignition is not lower by more than 0.01.
// Coverage score (ADR 0065, both reports with --objective coverage or coverageMixed): the combined cost
// lower by at least 0.02 with a 90% interval below 0, the coverage from the ignition not lower by more
// than 0.01, and the head-speed error of the fast runs not worse by more than 0.05. A tie keeps the base.
import { readFileSync } from "node:fs";
import { createRng } from "../src/random";

interface PerFire {
  fire: string;
  fold: string;
  cost: number;
  sorensen: number;
}
interface Parts {
  mixed: number;
  recall: number;
  anchor: number;
  anchorN: number;
}
interface Report {
  heldOutPerFire: PerFire[];
  space: string;
  fixed: object;
  settings: { seed: number };
  coverage?: { perFire: { fire: string; fitted: Parts }[] } | null;
}
const [basePath, hypPath] = process.argv.slice(2);
if (!basePath || !hypPath) throw new Error("uso: compare-calibrations.ts <base.json> <hipótese.json>");
const load = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Report;
const base = load(basePath);
const hyp = load(hypPath);
if (base.settings.seed !== hyp.settings.seed) throw new Error("sementes diferentes: as partes não são as mesmas");
const byFire = new Map(base.heldOutPerFire.map((p) => [p.fire, p]));
for (const h of hyp.heldOutPerFire) {
  const b = byFire.get(h.fire);
  if (!b) throw new Error(`${h.fire} não está na base`);
  if (b.fold !== h.fold) throw new Error(`${h.fire}: parte diferente (${b.fold} contra ${h.fold})`);
}
if (hyp.heldOutPerFire.length !== base.heldOutPerFire.length) throw new Error("os relatórios não têm os mesmos fogos");
const coverage = !!base.coverage && !!hyp.coverage;
if (!!base.coverage !== !!hyp.coverage) throw new Error("um relatório usa a pontuação de cobertura e o outro não");

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const dc: number[] = [], ds: number[] = [], da: number[] = [];
if (coverage) {
  const bParts = new Map(base.coverage!.perFire.map((r) => [r.fire, r.fitted]));
  for (const { fire, fitted: h } of hyp.coverage!.perFire) {
    const b = bParts.get(fire);
    if (!b) throw new Error(`${fire} não está na base`);
    dc.push(h.mixed - b.mixed);
    ds.push(h.recall - b.recall);
    if (h.anchorN > 0 && b.anchorN > 0) da.push(h.anchor - b.anchor);
  }
} else
  for (const h of hyp.heldOutPerFire) {
    const b = byFire.get(h.fire)!;
    dc.push(h.cost - b.cost);
    ds.push(h.sorensen - b.sorensen);
  }
const rng = createRng(4242);
const boot = Array.from({ length: 4000 }, () => {
  let a = 0;
  for (let k = 0; k < dc.length; k++) a += dc[Math.floor(rng() * dc.length)];
  return a / dc.length;
}).sort((a, b) => a - b);
const cost = mean(dc), p05 = boot[200], p95 = boot[3799], second = mean(ds), anchor = da.length ? mean(da) : 0;
const adopt = cost <= -0.02 && p95 < 0 && second >= -0.01 && (!coverage || anchor <= 0.05);
const sign = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;
console.log(`base ${base.space} ${JSON.stringify(base.fixed)} | hipótese ${hyp.space} ${JSON.stringify(hyp.fixed)}`);
console.log(
  coverage
    ? `${dc.length} fogos de teste: custo combinado ${sign(cost)} (90%: ${sign(p05)} a ${sign(p95)}), cobertura ${sign(second)}, cabeça ${sign(anchor)} (${da.length} fogos)`
    : `${dc.length} fogos de teste: custo ${sign(cost)} (90%: ${sign(p05)} a ${sign(p95)}), Sørensen ${sign(second)}`,
);
console.log(adopt ? "ADOTAR a hipótese." : "FICA a base (a hipótese não passa a regra).");
process.stdout.write(
  JSON.stringify({ fires: dc.length, score: coverage ? "coverage" : "intervals", cost, p05, p95, [coverage ? "recall" : "sorensen"]: second, ...(coverage && { anchor }), adopt }) + "\n",
);
