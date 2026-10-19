// Runs a saved scenario file through the engine and prints the metrics of A and B.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildScenario } from "../src/scenario";
import { simulate } from "../src/simulate";
import { loadSavedScenario } from "./saved-scenario";

const here = dirname(fileURLToPath(import.meta.url));
const { saved, grid, gridFor } = loadSavedScenario(process.argv[2], join(here, "../../web/public/grids"));
for (const d of ["A", "B"] as const) {
  const m = simulate(gridFor(d), buildScenario(grid.header, saved, d)).metrics;
  const villages = m.villages.map((v) => `${v.name}: ${v.firstArrivalMin?.toFixed(0) ?? "-"}`).join(", ");
  console.log(d, "ha/h", m.burnedHaByHour.map(Math.round), "| edifícios", m.buildingsReached, "|", villages);
}
