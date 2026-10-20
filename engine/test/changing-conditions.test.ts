// The solver when conditions change during the fire (weather steps, slowdowns that start later) and
// at cell corners. A step's time is fixed when it leaves its cell; these tests check that the steps
// under way are recomputed when the weather or an intervention changes, so the result does not
// depend on the cell size, and that a fire cannot squeeze between two diagonal barrier cells.
import { describe, expect, it } from "vitest";
import { ANDERSON_13 } from "../src/fuel-models";
import type { FuelMoisture } from "../src/rothermel";
import { simulate } from "../src/simulate";
import { cornerCells, crossedCells } from "../src/spread-rothermel";
import type { Scenario, WeatherStep } from "../src/types";
import { makeGrid, scenario } from "./helpers";

const grass = ANDERSON_13[1];
const rothermel = { spreadModel: "rothermel" as const };
const EXTENT_M = 6000;
const dry: FuelMoisture = { d1: 0.05, d10: 0.06, d100: 0.07, liveHerb: 0.3, liveWoody: 0.9 };
const damp: FuelMoisture = { ...dry, d1: 0.1, d10: 0.11, d100: 0.12 }; // grass extinction is 12%
const wet: FuelMoisture = { ...dry, d1: 0.2, d10: 0.2, d100: 0.2 };

/** Burned hectares on a flat grass square of EXTENT_M at this cell size, ignited at the centre. */
function burnedHa(cell: number, weatherSteps: WeatherStep[], durationMin: number, extra: Partial<Scenario> = {}): number {
  const n = Math.round(EXTENT_M / cell);
  const grid = makeGrid({ rows: n, cols: n, cellSize: cell, rothermel: grass });
  const mid = Math.floor(n / 2);
  return simulate(
    grid,
    scenario({
      ...rothermel,
      ignition: { row: mid, col: mid },
      wind: weatherSteps[0].wind,
      moisture: weatherSteps[0].moisture,
      weatherSteps,
      durationMin,
      params: { rosAdj: 0.5 },
      ...extra,
    }),
  ).metrics.burnedHaByHour.at(-1)!;
}

const spread = (xs: number[]) => Math.max(...xs) / Math.min(...xs);

describe("conditions that change during the fire", () => {
  it("a calm start does not freeze the fire: the steps under way speed up when the wind rises", () => {
    const steps: WeatherStep[] = [
      { fromMin: 0, wind: { directionDeg: 270, speedMs: 0 }, moisture: dry },
      { fromMin: 120, wind: { directionDeg: 270, speedMs: 8 }, moisture: dry },
    ];
    const ha = [100, 50, 30].map((cell) => burnedHa(cell, steps, 240));
    // Before the fix the 100 m fire burned 1 ha: its first steps, launched in the calm, took over 4 hours.
    expect(ha[0]).toBeGreaterThan(100);
    expect(spread(ha)).toBeLessThan(1.12);
  });

  it("steps launched in dry weather slow down when the fuel turns damp", () => {
    const steps: WeatherStep[] = [
      { fromMin: 0, wind: { directionDeg: 270, speedMs: 6 }, moisture: dry },
      { fromMin: 90, wind: { directionDeg: 270, speedMs: 1 }, moisture: damp },
    ];
    const ha = [100, 50, 30].map((cell) => burnedHa(cell, steps, 240));
    expect(spread(ha)).toBeLessThan(1.1);
  });

  it("a fire stopped by wet fuel spreads again when the fuel dries", () => {
    const steps: WeatherStep[] = [
      { fromMin: 0, wind: { directionDeg: 270, speedMs: 4 }, moisture: dry },
      { fromMin: 60, wind: { directionDeg: 270, speedMs: 4 }, moisture: wet },
      { fromMin: 180, wind: { directionDeg: 270, speedMs: 4 }, moisture: dry },
    ];
    const atNight = burnedHa(50, steps, 180);
    const nextMorning = burnedHa(50, steps, 300);
    expect(nextMorning).toBeGreaterThan(2 * atNight);
  });

  it("repeating the same weather changes nothing (the share already covered is kept exactly)", () => {
    const n = 81;
    const grid = makeGrid({ rows: n, cols: n, cellSize: 30, rothermel: grass });
    const w = { directionDeg: 250, speedMs: 5 };
    const run = (weatherSteps?: WeatherStep[]) =>
      simulate(grid, scenario({ ...rothermel, ignition: { row: 40, col: 40 }, wind: w, durationMin: 90, weatherSteps })).arrivalMin;
    const constant = run();
    const stepped = run([0, 7, 23.5, 40, 41, 77].map((fromMin) => ({ fromMin, wind: w })));
    for (let i = 0; i < constant.length; i++) {
      if (Number.isFinite(constant[i])) expect(stepped[i]).toBeCloseTo(constant[i], 3);
      else expect(stepped[i]).toBe(Infinity);
    }
  });

  it("an attack that starts while the fire crosses a cell slows the rest of that crossing", () => {
    const n = 21;
    const cell = 100;
    const grid = makeGrid({ rows: n, cols: n, cellSize: cell, rothermel: grass });
    const ignition = { row: 10, col: 10 };
    const wind = { directionDeg: 270, speedMs: 2 };
    // Every cell east of the ignition column.
    const zone = Array.from({ length: n * (n - 11) }, (_, k) => ({ row: Math.floor(k / (n - 11)), col: 11 + (k % (n - 11)) }));
    const run = (interventions: Scenario["interventions"]) =>
      simulate(grid, scenario({ ...rothermel, ignition, wind, moisture: dry, durationMin: 600, interventions })).arrivalMin;
    const free = run([]);
    const east = 10 * n + 11;
    expect(free[east]).toBeGreaterThan(10); // the step to the east neighbour is still under way at minute 10
    const attacked = run([{ kind: "suppression", cells: zone, startMin: 10, rateFactor: 0.2 }]);
    expect(attacked[east]).toBeGreaterThan(free[east] + 1);
  });
});

describe("cell corners", () => {
  it("a diagonal move passes through one corner, between two side cells", () => {
    const cells = crossedCells(1, 1);
    expect(cells.map((c) => [c.dr, c.dc])).toEqual([[0, 0], [1, 1]]);
    expect(cornerCells(cells)).toEqual([undefined, [{ dr: 0, dc: 1 }, { dr: 1, dc: 0 }]]);
    expect(cornerCells(crossedCells(1, 2))).toBeUndefined();
  });

  it("fire does not leak through a water line drawn only with diagonal cells (8-connected)", () => {
    const n = 61;
    // Water on the anti-diagonal r + c = n - 1: diagonal neighbours only, no shared edges.
    const grid = makeGrid({ rows: n, cols: n, cellSize: 30, rothermel: grass, barrier: (r, c) => r + c === n - 1 });
    const { arrivalMin } = simulate(
      grid,
      scenario({ ...rothermel, ignition: { row: 15, col: 15 }, wind: { directionDeg: 315, speedMs: 10 }, moisture: dry, durationMin: 600 }),
    );
    let beyond = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (r + c > n - 1 && Number.isFinite(arrivalMin[r * n + c])) beyond++;
    let before = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (r + c < n - 1 && Number.isFinite(arrivalMin[r * n + c])) before++;
    expect(before).toBeGreaterThan(1000);
    expect(beyond).toBe(0);
  });
});

describe("options for the structural hypotheses (ADR 0061)", () => {
  it("a shallower crown ratio shelters less: the wind adjustment factor rises", async () => {
    const { windAdjustmentFactor } = await import("../src/rothermel");
    expect(windAdjustmentFactor(0.5, 0.5, 12, 0.5)).toBeGreaterThan(windAdjustmentFactor(0.5, 0.5, 12, 1));
    expect(windAdjustmentFactor(0.5, 0.5, 12, 1)).toBeCloseTo(windAdjustmentFactor(0.5, 0.5), 10);
  });

  it("smoothing the elevation lowers the steepest slopes and leaves a plane unchanged", async () => {
    const { terrainOf } = await import("../src/surface");
    const n = 41;
    const bumpy = makeGrid({ rows: n, cols: n, cellSize: 30, rothermel: grass, elevation: (r, c) => 2 * c + ((r * 7 + c * 13) % 5) * 3 });
    const max = (a: Float32Array) => a.reduce((m, v) => Math.max(m, v), 0);
    expect(max(terrainOf(bumpy, 30).slopeTan)).toBeLessThan(max(terrainOf(bumpy, 0).slopeTan));
    const plane = makeGrid({ rows: n, cols: n, cellSize: 30, rothermel: grass, elevation: (_, c) => 3 * c });
    const mid = 20 * n + 20;
    expect(terrainOf(plane, 60).slopeTan[mid]).toBeCloseTo(terrainOf(plane, 0).slopeTan[mid], 6);
  });
});
