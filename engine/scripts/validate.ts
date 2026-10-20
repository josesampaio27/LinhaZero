// Compares both spread models with the real fires in engine/test/reference (PT-FireSprd).
//   npm run validate -w engine                 all cases, default parameters
//   npm run validate -w engine -- --rosAdj 1.5 --windAdj 1.2
//   npm run validate -w engine -- --set all --intervals   the 80 fires (build_references.py), interval scores
//   npm run validate -w engine -- --set ../data-prep/out/reference-30m   a folder of built cases (30 m)
import { resolve } from "node:path";
import { PT_CALIBRATION } from "../src/calibration";
import type { ModelParams } from "../src/params";
import { scoreIntervals, weightedCost } from "./intervals";
import {
  FULL_REFERENCE_DIR,
  REFERENCE_DIR,
  listCases,
  loadCase,
  scoreCase,
  scoreCaseMean,
  type CaseScore,
} from "./reference";

const args = process.argv.slice(2);
const params: Partial<ModelParams> = {};
let runs = 10; // random realisations per fire for the Rothermel model (breaches, spot fires); 1 = deterministic
let dir = REFERENCE_DIR;
let intervals = false;
for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace(/^--/, "");
  if (key === "runs") runs = Number(args[i + 1]);
  else if (key === "set") dir = args[i + 1] === "all" ? FULL_REFERENCE_DIR : args[i + 1] === "ci" ? REFERENCE_DIR : resolve(args[i + 1]);
  else if (key === "intervals") {
    intervals = true;
    i--; // a flag without a value
  } else params[key as keyof ModelParams] = Number(args[i + 1]);
}

const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const rows: CaseScore[] = [];
console.log(
  "Fogo                         modelo     Sørensen médio  final   área sim/obs (final)  erro chegada mediano (min)  viés (min)  não alcançadas",
);
for (const fire of listCases(dir)) {
  const c = loadCase(fire, dir);
  if (intervals) {
    const cal = { ...PT_CALIBRATION, ...params };
    const s = scoreIntervals(c, cal);
    console.log(`${fire}: custo por intervalo ${f(weightedCost(s))} (calibrado), ${f(weightedCost(scoreIntervals(c, params)))} (sem calibração)`);
    for (const x of s)
      console.log(
        `   ${f(x.startMin / 60, 1).padStart(5)}–${f(x.endMin / 60, 1).padEnd(5)} h  novas obs ${String(x.observedNew).padStart(5)} sim ${String(x.simulatedNew).padStart(5)}  ` +
          `Sørensen ${f(x.sorensen)}  velocidade sim ${f(x.simulatedRateMMin, 1)} obs ${f(x.observedRateMMin, 1)} L2 ${x.l2RateMMin === null ? "—" : f(x.l2RateMMin, 1)} m/min${x.freeRunning ? "" : "  (lento, peso 0,25)"}`,
      );
  }
  for (const variant of ["legacy", "rothermel", "calibrado"] as const) {
    const model = variant === "legacy" ? "legacy" : "rothermel";
    const p =
      variant === "calibrado" ? { ...PT_CALIBRATION, ...params } : params;
    const s = {
      ...(model === "rothermel"
        ? scoreCaseMean(c, model, p, runs)
        : scoreCase(c, model)),
      model: variant as never,
    };
    rows.push(s);
    const last = s.atObservations[s.atObservations.length - 1];
    const label = `${fire}${c.fuelYearMatches ? "" : " *"}`.slice(0, 28);
    console.log(
      `${label.padEnd(28)} ${model.padEnd(10)} ${f(s.meanSorensen).padStart(14)}  ${f(s.finalSorensen).padStart(5)}   ` +
        `${f(last.simulatedHa, 0).padStart(6)} / ${f(last.observedHa, 0).padEnd(6)} ha       ` +
        `${f(s.arrival.medianAbsMin, 0).padStart(10)}                ${f(s.arrival.biasMin, 0).padStart(8)}    ` +
        `${s.arrival.missed}/${s.arrival.cells}`,
    );
  }
}
for (const model of ["legacy", "rothermel", "calibrado"] as const) {
  const m = rows.filter((r) => (r.model as string) === model);
  const mean = (k: (r: CaseScore) => number) =>
    m.reduce((a, r) => a + k(r), 0) / m.length;
  console.log(
    `\nMédia ${model}: Sørensen médio ${f(mean((r) => r.meanSorensen))}, final ${f(mean((r) => r.finalSorensen))}`,
  );
}
console.log(
  "\n* combustível de outro ano (FUMOD só existe desde 2018): a cicatriz do fogo aparece com o combustível de depois.",
);
