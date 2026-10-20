// Paired comparison of two calibration reports on the same held-out fires (ADR 0064): a structural
// hypothesis (crown fire off, one global factor, crown ratio, smoothed relief) against the base.
//   tsx scripts/compare-calibrations.ts <base.json> <hypothesis.json>
// Both must come from calibrate.ts with the same cases, selection and seed, so the 5 folds are the same
// fires; each fire's held-out cost is the one of the fit on the other four folds. The hypothesis replaces
// the base only if its cost is lower by at least 0.02 with a 90% bootstrap interval below 0, and the
// Sørensen from the ignition is not lower by more than 0.01. A tie keeps the base.
import { readFileSync } from "node:fs";
import { createRng } from "../src/random";

interface PerFire {
  fire: string;
  fold: string;
  cost: number;
  sorensen: number;
}
const [basePath, hypPath] = process.argv.slice(2);
if (!basePath || !hypPath) throw new Error("uso: compare-calibrations.ts <base.json> <hipótese.json>");
const load = (p: string) => JSON.parse(readFileSync(p, "utf8")) as { heldOutPerFire: PerFire[]; space: string; fixed: object; settings: { seed: number } };
const base = load(basePath);
const hyp = load(hypPath);
if (base.settings.seed !== hyp.settings.seed) throw new Error("sementes diferentes: as partes não são as mesmas");
const byFire = new Map(base.heldOutPerFire.map((p) => [p.fire, p]));
const dc: number[] = [], ds: number[] = [];
for (const h of hyp.heldOutPerFire) {
  const b = byFire.get(h.fire);
  if (!b) throw new Error(`${h.fire} não está na base`);
  if (b.fold !== h.fold) throw new Error(`${h.fire}: parte diferente (${b.fold} contra ${h.fold})`);
  dc.push(h.cost - b.cost);
  ds.push(h.sorensen - b.sorensen);
}
if (dc.length !== base.heldOutPerFire.length) throw new Error("os relatórios não têm os mesmos fogos");
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const rng = createRng(4242);
const boot = Array.from({ length: 4000 }, () => {
  let a = 0;
  for (let k = 0; k < dc.length; k++) a += dc[Math.floor(rng() * dc.length)];
  return a / dc.length;
}).sort((a, b) => a - b);
const cost = mean(dc), p05 = boot[200], p95 = boot[3799], sor = mean(ds);
const adopt = cost <= -0.02 && p95 < 0 && sor >= -0.01;
const sign = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;
console.log(`base ${base.space} ${JSON.stringify(base.fixed)} | hipótese ${hyp.space} ${JSON.stringify(hyp.fixed)}`);
console.log(`${dc.length} fogos de teste: custo ${sign(cost)} (90%: ${sign(p05)} a ${sign(p95)}), Sørensen ${sign(sor)}`);
console.log(adopt ? "ADOTAR a hipótese." : "FICA a base (a hipótese não passa a regra).");
process.stdout.write(JSON.stringify({ fires: dc.length, cost, p05, p95, sorensen: sor, adopt }) + "\n");
