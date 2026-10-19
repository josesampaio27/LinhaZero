// Measures single-run and ensemble times on the synthetic grid and on a 200x200 grid.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ANDERSON_13 } from "../src/fuel-models";
import { prepareGrid } from "../src/grid";
import { simulate } from "../src/simulate";
import { rothermelEnsemble, rothermelParams } from "../src/scenario";
import type { GridData, PreparedGrid, Scenario } from "../src/types";
import { loadGridFromDir } from "./load-grid-node";

const here = dirname(fileURLToPath(import.meta.url));

function bigGrid(size: number): PreparedGrid {
  const n = size * size;
  const g: GridData = {
    header: {
      name: "bench", crs: "EPSG:3763", originX: 0, originY: 0, cellSize: 100, rows: size, cols: size,
      layers: { fuel: "", elevation: "", barrier: "", buildings: "", village: "" },
      villages: [],
      fuelTable: {
        1: { label: "Herbáceo", baseRate: 15, rothermel: ANDERSON_13[1] },
        2: { label: "Mato", baseRate: 8, rothermel: ANDERSON_13[4] },
      },
    },
    fuel: new Uint8Array(n).map((_, i) => 1 + (((i * 2654435761) >>> 0) % 2)),
    elevation: new Float32Array(n).map((_, i) => 200 + 100 * Math.sin(i / 3000)),
    barrier: new Uint8Array(n),
    buildings: new Uint16Array(n),
    village: new Uint16Array(n),
  };
  return prepareGrid(g);
}

function time(label: string, fn: () => unknown, reps = 5): void {
  fn(); // warm-up
  const t0 = performance.now();
  for (let i = 0; i < reps; i++) fn();
  console.log(`${label}: ${((performance.now() - t0) / reps).toFixed(1)} ms`);
}

const synthetic = prepareGrid(loadGridFromDir(join(here, "../../web/public/grids/sintetica")));
const big = bigGrid(200);
// Long duration so that the fire covers most of the grid (worst case).
const s = (row: number, col: number): Scenario => ({
  ignition: { row, col },
  wind: { directionDeg: 225, speedMs: 8 },
  durationMin: 100000,
  interventions: [],
});
const ens = { runs: 30, windDirJitterDeg: 20, windSpeedJitterPct: 25, seed: 1 };

time("Sintética 150x150, 1 corrida (grelha inteira)", () => simulate(synthetic, s(75, 60)));
time("200x200, 1 corrida (grelha inteira)", () => simulate(big, s(100, 100)));
time("200x200, 30 corridas de ensemble + 1", () => simulate(big, { ...s(100, 100), ensemble: ens }), 2);

// Rothermel model (Anderson grass and brush instead of the legacy base rates).
const roth = (sc: Scenario): Scenario => ({ ...sc, spreadModel: "rothermel" });
time("200x200, 1 corrida (grelha inteira), Rothermel", () => simulate(big, roth(s(100, 100))));
time("200x200, 30 corridas de ensemble + 1, Rothermel", () => simulate(big, roth({ ...s(100, 100), ensemble: ens })), 2);

// 1000x1000 (1 M cells), 4 h of fire: the case that sets the ensemble budget.
const huge = bigGrid(1000);
const fourHours = { ...s(500, 500), durationMin: 240, ensemble: ens };
time("1000x1000, 4 h, 30 corridas + 1, legado", () => simulate(huge, fourHours), 1);
time("1000x1000, 4 h, 30 corridas + 1, Rothermel", () => simulate(huge, roth(fourHours)), 1);

// Guimarães at 30 m (about 260 000 cells), real fuels and canopy, 4 h with a 10 m/s wind.
const g30 = prepareGrid(loadGridFromDir(join(here, "../../web/public/grids/guimaraes-30m")));
const real = (spreadModel: "legacy" | "rothermel"): Scenario => ({
  ignition: { row: 81, col: 297 },
  wind: { directionDeg: 225, speedMs: 10 },
  durationMin: 240,
  interventions: [],
  spreadModel,
  ensemble: ens,
});
time("Guimarães 30 m, 4 h, 30 corridas + 1, legado", () => simulate(g30, real("legacy")), 2);
time("Guimarães 30 m, 4 h, 30 corridas + 1, Rothermel", () => simulate(g30, real("rothermel")), 2);
// The app's Rothermel ensemble: calibrated parameters, wider wind jitter and per-run perturbations.
const calibrated: Scenario = { ...real("rothermel"), params: rothermelParams(), ensemble: rothermelEnsemble(ens) };
time("Guimarães 30 m, 4 h, 30 corridas + 1, Rothermel calibrado com perturbações", () => simulate(g30, calibrated), 2);
