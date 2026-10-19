// Writes the scenario of a replayed real fire (called by data-prep/export_replay.py):
//   tsx scripts/export-replay.ts <case dir> <grid name> <label> <out.json>
// The scenario starts from the observed ignition area, with the hourly weather of those days and the
// fuel moisture of each hour, calibrated Rothermel and the uncertainty on, for as long as the fire was
// observed. Same inputs as the validation (scripts/reference.ts), so the app shows what was scored.
import { writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { SavedScenario } from "../src/scenario";
import { loadCase, weatherStepsOf } from "./reference";

const [caseDir, gridName, label, outPath] = process.argv.slice(2);
const c = loadCase(basename(caseDir), dirname(caseDir));
const durationMin = c.observationMinutes[c.observationMinutes.length - 1];
const weatherSteps = weatherStepsOf(c, durationMin);
const n = c.ignitionArea.length;
const centre: [number, number] = [
  c.ignitionArea.reduce((s, p) => s + p[0], 0) / n,
  c.ignitionArea.reduce((s, p) => s + p[1], 0) / n,
];
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const scenario: SavedScenario = {
  version: 3,
  title: `Incêndio real: ${label}`,
  grid: gridName,
  ignition: centre,
  burnedArea: c.ignitionArea,
  wind: weatherSteps[0].wind,
  durationMin,
  ensemble: true,
  decisions: { A: [], B: [] },
  variants: { A: null, B: null },
  spreadModel: "rothermel",
  moisture: weatherSteps[0].moisture,
  weatherSteps: weatherSteps.map((s) => ({
    fromMin: round(s.fromMin, 1),
    wind: { directionDeg: round(s.wind.directionDeg, 0), speedMs: round(s.wind.speedMs, 2) },
    ...(s.moisture && {
      moisture: Object.fromEntries(Object.entries(s.moisture).map(([k, v]) => [k, round(v as number, 4)])) as unknown as typeof s.moisture,
    }),
  })),
};
writeFileSync(outPath, JSON.stringify(scenario, null, 2) + "\n");
console.log(`${outPath}: ${durationMin} min, ${weatherSteps.length} horas de tempo`);
