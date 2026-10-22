// Checks the calibration pipeline before a long run (calibrate.ts), in three steps:
//   1. Reproduction: re-scores a report's best parameter set on the same fires with today's code and cases, and
//      compares with the objective the report recorded. A match means the cases, the scoring and the engine
//      agree with that calibration.
//   2. The switches reach the simulations: the objective with --fixed switches differs from without them.
//   3. What the fit can move: each dimension of the search space nudged around the best set, with the
//      switches on; a dimension that changes nothing is dead for that model.
//   npx tsx scripts/check-calibration.ts --report reports/pt-firesprd-2026-10-21.json --select reports/selection-100m.json \
//     --objective coverageMixed --fixed shrubModel=1,shapeModel=1
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ModelParams } from "../src/params";
import { defaultJobs, Pool, type CaseRef } from "./calibration-pool";
import { fromParams, penalty, SPACES, toParams } from "./calibration-space";
import { FULL_REFERENCE_DIR } from "./reference";

const args = process.argv.slice(2);
const text = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const report = JSON.parse(readFileSync(resolve(text("report", "reports/pt-firesprd-2026-10-21.json")), "utf8"));
const selection = JSON.parse(readFileSync(resolve(text("select", "reports/selection-100m.json")), "utf8")) as { fit: string[] };
const objective = text("objective", "coverageMixed") as "intervals" | "coverage" | "coverageMixed";
const switches: Partial<ModelParams> = Object.fromEntries(
  text("fixed", "")
    .split(",")
    .filter(Boolean)
    .map((kv) => {
      const [k, v] = kv.split("=");
      return [k, Number(v)];
    }),
);
const space = SPACES[report.space as string];
if (!space) throw new Error(`espaço desconhecido no relatório: ${report.space}`);

const refs: CaseRef[] = selection.fit.map((fire) => ({ fire, dir: FULL_REFERENCE_DIR }));
const fires = refs.map((_, i) => i);
const pool = new Pool(refs, defaultJobs(), { weather: report.settings.weather, moisture: report.settings.moisture });
const metric = { metric: objective };
const J = async (p: Partial<ModelParams>) => {
  const costs = await pool.scores(p, fires, metric);
  return costs.reduce((a, b) => a + b, 0) / costs.length + penalty(fromParams(p, space), space);
};
const f4 = (v: number) => v.toFixed(4);

// 1. Reproduction.
const best: Partial<ModelParams> = { ...report.fixed, ...report.best };
const j = await J(best);
const gap = Math.abs(j - report.bestObjective);
console.log(`1. reprodução: objetivo ${f4(j)} hoje, ${f4(report.bestObjective)} no relatório (diferença ${gap.toExponential(2)})`);
console.log(gap < 1e-3 ? "   ok: casos, pontuação e motor dão o mesmo que essa calibração" : "   DIFERENTE: ver porquê antes de calibrar");

// 2. The switches reach the simulations.
if (Object.keys(switches).length) {
  const withSwitches = await J({ ...best, ...switches });
  console.log(`2. com ${JSON.stringify(switches)}: objetivo ${f4(withSwitches)} (sem: ${f4(j)})`);
  console.log(withSwitches !== j ? "   ok: as opções chegam às simulações da calibração" : "   ERRO: as opções não mudam nada");
}

// 3. What the fit can move, with the switches.
console.log(`3. sensibilidade de cada dimensão (±0,2 em x, com as opções):`);
const x0 = fromParams({ ...best, ...switches }, space);
const base = await J({ ...best, ...switches });
for (let d = 0; d < space.length; d++) {
  const at = async (dx: number) => {
    const x = [...x0];
    x[d] += dx;
    // The penalty moves with x by construction; what matters is whether the fires' cost moves.
    return (await J({ ...best, ...switches, ...toParams(x, space) })) - penalty(x, space);
  };
  const lo = await at(-0.2);
  const hi = await at(0.2);
  const ref = base - penalty(x0, space);
  const moves = Math.max(Math.abs(lo - ref), Math.abs(hi - ref));
  console.log(`   ${space[d].name.padEnd(18)} custo ${f4(lo)} / ${f4(ref)} / ${f4(hi)}  ${moves < 1e-9 ? "MORTA: não mexe em nada" : "mexe"}`);
}
await pool.close();
