import { describe, expect, it } from "vitest";
import {
  COVERAGE,
  coverageCost,
  heldFlankZone,
  scoreIntervals,
  tversky,
  weightedCoverageCost,
  type IntervalScore,
} from "../scripts/intervals";
import type { L2Interval, ReferenceCase } from "../scripts/reference";
import { ANDERSON_13 } from "../src/fuel-models";
import { rothermelParams } from "../src/scenario";
import { simulate } from "../src/simulate";
import type { Scenario } from "../src/types";
import { makeGrid } from "./helpers";

// The coverage score (ADR 0065): the engine has no firefighting and the real fires were fought, so it
// must pay more for missing burned ground than for burning more, and nothing for spreading where the
// crews held the real fire.

const CELL = 30;
const cellHa = (CELL * CELL) / 10_000;
const interval = (tp: number, fp: number, fn: number, freeRunning = true, fpHeld = 0): IntervalScore => ({
  fire: "x",
  startMin: 0,
  endMin: 60,
  observedNew: tp + fn,
  simulatedNew: tp + fp,
  sorensen: (2 * tp) / (2 * tp + fp + fn),
  growthError: 0,
  observedRateMMin: 10,
  simulatedRateMMin: 10,
  l2RateMMin: null,
  freeRunning,
  weight: freeRunning ? 1 : 0.25,
  tp,
  fp,
  fn,
  fpHeld,
  anchor: false,
});

describe("coverage cost of an interval", () => {
  it("is Sørensen with equal weights", () => {
    expect(tversky(30, 10, 20, 0.5, 0.5)).toBeCloseTo((2 * 30) / (2 * 30 + 10 + 20), 12);
  });

  it("costs little for burning up to three times the real growth, and more beyond", () => {
    const twice = coverageCost(interval(100, 100, 0), cellHa);
    const five = coverageCost(interval(100, 400, 0), cellHa);
    expect(twice).toBeLessThan(0.2);
    expect(five).toBeGreaterThan(twice + 0.3);
  });

  it("costs more for missing half the growth than for burning twice as much", () => {
    expect(coverageCost(interval(50, 0, 50), cellHa)).toBeGreaterThan(coverageCost(interval(100, 100, 0), cellHa) + 0.4);
  });

  it("does not charge extra burn beyond the ×3 cap in a slow interval (night, held)", () => {
    const slow = interval(100, 400, 0, false);
    expect(coverageCost(slow, cellHa)).toBeCloseTo(1 - tversky(100, 400, 0), 12);
  });

  it("leaves out the extra burn beyond a held flank", () => {
    expect(coverageCost(interval(100, 400, 0, true, 400), cellHa)).toBeCloseTo(coverageCost(interval(100, 0, 0), cellHa), 12);
  });

  it("adds the head-speed error of the fast runs", () => {
    const fast = { ...interval(100, 0, 0), anchor: true, simulatedRateMMin: 5, observedRateMMin: 20 };
    expect(weightedCoverageCost([fast], cellHa)).toBeCloseTo(coverageCost(fast, cellHa) + COVERAGE.anchorWeight * Math.log(4), 12);
  });
});

/**
 * A 81 × 81 grid of 30 m cells: a block burned at the ignition (rows and columns 35-45) that grew only
 * east during the first hour (columns 46-55), so its west edge was held.
 */
function heldCase(intervals: L2Interval[] = []): ReferenceCase {
  const n = 81;
  const grid = makeGrid({ rows: n, cols: n, cellSize: CELL, rothermel: { ...ANDERSON_13[1], group: "H" } });
  const { originX, originY } = grid.header;
  const at = (r: number, c: number): [number, number] => [originX + (c + 0.5) * CELL, originY - (r + 0.5) * CELL];
  const observed = new Float32Array(n * n).fill(Infinity);
  for (let r = 35; r <= 45; r++)
    for (let c = 35; c <= 55; c++) observed[r * n + c] = c <= 45 ? 0 : 60;
  const hours = [0, 1].map((h) => ({
    timeUtc: new Date(Date.UTC(2020, 7, 1, 12 + h)).toISOString().replace(".000", ""),
    tempC: 30,
    rhPct: 20,
    windSpeedMs: 0,
    windFromDeg: 270,
    cloudPct: 0,
  }));
  return {
    fire: "held",
    dir: "",
    grid,
    observed,
    t0Utc: hours[0].timeUtc,
    ignitionArea: [at(40, 40), at(40, 40), at(40, 40)],
    observationMinutes: [60],
    fuelYear: 2020,
    fuelYearMatches: true,
    centroid: [41.4, -8.3],
    weather: hours,
    intervals,
  };
}

describe("held flanks", () => {
  it("are found from the observation alone: the edge with no growth near it", () => {
    const c = heldCase();
    const zone = heldFlankZone(c, 0, 60)!;
    const n = 81;
    expect(zone).not.toBeNull();
    expect(zone[40 * n + 20]).toBe(1); // west of the block: beyond the held edge
    expect(zone[30 * n + 37]).toBe(1); // north, next to the held part of the edge
    expect(zone[40 * n + 70]).toBe(0); // east: where the fire grew
    expect(zone[30 * n + 44]).toBe(0); // north, next to the active part
  });

  it("leave out the simulated spread beyond them, and only that", () => {
    const [s] = scoreIntervals(heldCase(), {}, { minNewHa: 0 });
    // No wind: the simulation spreads every way, also west, where the crews held the real fire.
    expect(s.fp).toBeGreaterThan(0);
    expect(s.fpHeld).toBeGreaterThan(0);
    expect(s.fpHeld).toBeLessThan(s.fp);
  });
});

describe("head-speed anchor", () => {
  const l2 = (qc: number): L2Interval => ({
    startMin: 0,
    endMin: 60,
    areaHa: null,
    growthHaH: null,
    rosMH: 1200,
    rosPerimeterMH: 1200,
    dirDeg: 90,
    dirPerimeterDeg: 90,
    qc,
    source: "test",
  });

  it("picks fast runs by the data alone, whatever the parameters", () => {
    for (const p of [{}, { rosAdjGrass: 0.2 }, { windAdj: 3 }]) {
      expect(scoreIntervals(heldCase([l2(4)]), p, { minNewHa: 0 })[0].anchor).toBe(true);
      expect(scoreIntervals(heldCase([l2(2)]), p, { minNewHa: 0 })[0].anchor).toBe(false);
    }
  });
});

describe("an observed start that cannot burn", () => {
  it("starts on the nearest burnable cell, as a point ignition does", () => {
    // At 100 m the observed ignition zone of a fire can be one cell, and that cell a road.
    const grid = makeGrid({ rows: 41, cols: 41, cellSize: 100, rothermel: { ...ANDERSON_13[1], group: "H" }, barrier: (_, c) => c === 20 });
    for (let i = 0; i < 41 * 41; i++) if (grid.barrier[i]) grid.baseRate[i] = 0;
    const r = simulate(grid, {
      ignition: { row: 20, col: 20 },
      ignitions: [{ cell: { row: 20, col: 20 }, t0Min: 0, burned: true }],
      wind: { directionDeg: 270, speedMs: 3 },
      durationMin: 60,
      interventions: [],
      spreadModel: "rothermel",
    });
    expect(r.arrivalMin.filter((a) => a <= 60).length).toBeGreaterThan(1);
  });
});

describe("calibration-only firefighting layer (bgSuppression)", () => {
  const grid = makeGrid({ rows: 61, cols: 61, cellSize: CELL, rothermel: { ...ANDERSON_13[1], group: "H" } });
  const scenario = (params?: Scenario["params"]): Scenario => ({
    ignition: { row: 30, col: 30 },
    wind: { directionDeg: 270, speedMs: 4 },
    durationMin: 120,
    interventions: [],
    spreadModel: "rothermel",
    params,
  });
  const burned = (a: Float32Array) => a.reduce((k, v) => (v <= 120 ? k + 1 : k), 0);
  const off = simulate(grid, scenario()).arrivalMin;

  it("changes nothing when off", () => {
    expect(simulate(grid, scenario({ bgSuppression: 1 })).arrivalMin).toEqual(off);
  });

  it("slows a fire the crews can attack", () => {
    const on = simulate(grid, scenario({ bgSuppression: 0.5, attackFullKwM: 20000, attackNoneKwM: 50000 })).arrivalMin;
    expect(burned(on)).toBeLessThan(0.6 * burned(off));
  });

  it("does nothing against a fire too intense to attack", () => {
    expect(simulate(grid, scenario({ bgSuppression: 0.5, attackFullKwM: 0, attackNoneKwM: 1 })).arrivalMin).toEqual(off);
  });

  it("never reaches the app, even from a grid variant", () => {
    expect(rothermelParams({ bgSuppression: 0.3, windAdj: 2 }, 30)).not.toHaveProperty("bgSuppression");
  });
});
