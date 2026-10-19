import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { prepareGrid } from "../src/grid";
import { comparePaired } from "../src/metrics";
import { buildScenario, cellAt, type ScenarioInputs } from "../src/scenario";
import { simulate } from "../src/simulate";
import { loadGridFromDir } from "../scripts/load-grid-node";

const here = dirname(fileURLToPath(import.meta.url));
const grids = join(here, "../../web/public/grids");

// Acceptance on the real grid, with the app's only spread model (Rothermel, calibrated) and its ensemble.
describe("Guimarães acceptance", () => {
  const grid = prepareGrid(loadGridFromDir(join(grids, "guimaraes")));
  // A fire south-west of the city, wind from the south-west; decision B draws a 30 m containment line
  // across its path, 300 m downwind, ready from the start.
  const ignition: [number, number] = [-11750, 203250];
  const inputs: ScenarioInputs = {
    ignition,
    wind: { directionDeg: 225, speedMs: 5 },
    durationMin: 240,
    ensemble: true,
    decisions: {
      A: [],
      B: [{ id: "linha", kind: "containmentLine", startMin: 0, widthM: 30, coords: [[-12599, 204523], [-10477, 202401]] }],
    },
    variants: { A: null, B: null },
  };

  it("a drawn line in the fire's path burns less, in most of the paired scenarios", () => {
    const a = simulate(grid, buildScenario(grid.header, inputs, "A"));
    const b = simulate(grid, buildScenario(grid.header, inputs, "B"));
    expect(a.metrics.burnedHaByHour.at(-1)!).toBeGreaterThan(20);
    expect(b.metrics.burnedHaByHour.at(-1)!).toBeLessThan(a.metrics.burnedHaByHour.at(-1)!);
    const ha = comparePaired(a.runs!, b.runs!, "burnedHa");
    expect(ha.bBetter).toBeGreaterThan(a.runs!.length / 2);
  });

  it("the same decision twice ties in every scenario", () => {
    const a = simulate(grid, buildScenario(grid.header, inputs, "A"));
    const again = simulate(grid, buildScenario(grid.header, inputs, "A"));
    expect(comparePaired(a.runs!, again.runs!, "burnedHa").ties).toBe(a.runs!.length);
  });

  it("guimaraes-30m: has the canopy layer and Rothermel parameters, and an ensemble runs in about a second", () => {
    const g30 = prepareGrid(loadGridFromDir(join(grids, "guimaraes-30m")));
    expect(g30.header.cellSize).toBe(30);
    expect(g30.canopy).toBeDefined();
    const t0 = performance.now();
    const { metrics } = simulate(g30, buildScenario(g30.header, { ...inputs, wind: { directionDeg: 225, speedMs: 10 }, decisions: { A: [], B: [] } }, "A"));
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(metrics.burnedHaByHour.at(-1)!).toBeGreaterThan(50);
    expect(cellAt(g30.header, ignition[0], ignition[1])).not.toBeNull();
  });
});
