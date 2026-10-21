// Which lever gives a calibration its result (ADR 0065, phase E3): the best fit of a report, scored again
// with one parameter at a time set back to its physical value, on the same fires.
//   tsx scripts/score-levers.ts <report.json> [--cases <dir>] [--select <selection.json>] [--jobs n]
// Prints, per variant, the coverage score's parts averaged over the fit fires, and the paired difference
// from the best fit. Scoring only, in the fit's own sample: it says which lever matters, not how well
// the calibration does on new fires (that is the report's held-out test).
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_PARAMS, type ModelParams } from "../src/params";
import { defaultJobs, Pool, type CoverageParts } from "./calibration-pool";

const args = process.argv.slice(2);
const text = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const reportPath = args.find((a) => a.endsWith(".json") && !a.includes("selection"));
if (!reportPath) throw new Error("uso: score-levers.ts <relatório.json> [--cases <pasta>] [--select <seleção.json>]");
const report = JSON.parse(readFileSync(reportPath, "utf8")) as { best: Partial<ModelParams>; provenance: { cases: string } };
const CASES = resolve(text("cases", report.provenance.cases));
const selection = JSON.parse(readFileSync(resolve(text("select", "reports/selection-30m.json")), "utf8")) as { fit: string[] };
const fires = selection.fit.filter((f) => existsSync(join(CASES, f, "case.json")));
const pool = new Pool(fires.map((fire) => ({ fire, dir: CASES })), Number(text("jobs", String(defaultJobs()))));

const best = report.best;
const levers: (keyof ModelParams)[] = ["holdWidthPerFlame", "crownAdj", "windAdj"];
const variants: [string, Partial<ModelParams>][] = [
  ["melhor ajuste", best],
  ...levers.filter((k) => k in best).map((k): [string, Partial<ModelParams>] => [`${k} físico`, { ...best, [k]: DEFAULT_PARAMS[k] }]),
  ["modelo físico", { crownFire: best.crownFire ?? 0 }],
];
const all = fires.map((_, i) => i);
const scored = await Promise.all(
  variants.map(([, p]) => Promise.all(all.map((fire) => pool.runAny<CoverageParts | null>({ metric: "coverageParts", params: p, fire })))),
);
await pool.close();

const keep = all.filter((i) => scored.every((s) => s[i]));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const f3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : "—");
const sg = (v: number) => `${v >= 0 ? "+" : ""}${f3(v)}`;
console.log(`${keep.length} fogos, ${CASES}`);
console.log("variante                     combinado  Tversky  cobertura  Sørensen  cabeça   | contra o melhor: combinado  cobertura");
variants.forEach(([name], v) => {
  const s = keep.map((i) => scored[v][i]!);
  const b = keep.map((i) => scored[0][i]!);
  const anchor = mean(s.filter((x) => x.anchorN > 0).map((x) => x.anchor));
  console.log(
    `${name.padEnd(28)} ${f3(mean(s.map((x) => x.mixed))).padStart(9)}  ${f3(mean(s.map((x) => x.tversky))).padStart(7)}  ${f3(mean(s.map((x) => x.recall))).padStart(9)}  ` +
      `${f3(mean(s.map((x) => x.sorensen))).padStart(8)}  ${f3(anchor).padStart(6)}   | ${sg(mean(s.map((x, j) => x.mixed - b[j].mixed))).padStart(10)}  ${sg(mean(s.map((x, j) => x.recall - b[j].recall))).padStart(9)}`,
  );
});
