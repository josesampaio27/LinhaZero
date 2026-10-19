import { describe, expect, it } from "vitest";
import { ANDERSON_13 } from "../src/fuel-models";
import { comparePaired } from "../src/metrics";
import {
  DEFAULT_MOISTURE,
  headFire,
  midflameWind,
  prepareFuelBed,
  surfaceBase,
  type FuelParams,
} from "../src/rothermel";
import { simulate } from "../src/simulate";
import { makeGrid, reach, scenario } from "./helpers";

const N = 161;
const MID = 80;
const CELL = 10;
const at = (r: number, c: number) => r * N + c;
const grass = ANDERSON_13[1];
const rothermel = { spreadModel: "rothermel" as const };

/** Head fire the engine should use on flat ground for a 10-m wind blowing towards windToDeg. */
function expectedHead(fuel = grass, wind10m: number, windToDeg: number) {
  const bed = prepareFuelBed(fuel);
  return headFire(
    surfaceBase(bed, DEFAULT_MOISTURE),
    midflameWind(wind10m, bed),
    windToDeg,
    0,
    0,
  );
}

describe("spread engine with the Rothermel model", () => {
  it("no wind, no slope: symmetric spread at the no-wind rate", () => {
    const grid = makeGrid({ rows: N, cols: N, rothermel: grass });
    const { arrivalMin } = simulate(
      grid,
      scenario({
        ignition: { row: MID, col: MID },
        durationMin: 60,
        ...rothermel,
      }),
    );
    const reaches = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ].map(([dr, dc]) => reach(arrivalMin, N, MID, MID, dr, dc));
    expect(reaches[0]).toBeGreaterThan(3);
    for (const r of reaches) expect(r).toBe(reaches[0]);
    const r0 = surfaceBase(prepareFuelBed(grass), DEFAULT_MOISTURE).r0;
    expect(arrivalMin[at(MID, MID + 5)]).toBeCloseTo((5 * CELL) / r0, 4); // rates are stored as Float32
  });

  /** Burns grass with a west wind and returns the expected head fire and the burned shape. */
  function windShape(wind10m: number) {
    const grid = makeGrid({ rows: N, cols: N, rothermel: grass });
    const c0 = 30; // ignition near the west edge, wind blowing east
    const head = expectedHead(grass, wind10m, 90);
    const back = (head.ros * (1 - head.eccentricity)) / (1 + head.eccentricity);
    const { arrivalMin } = simulate(
      grid,
      scenario({
        ignition: { row: MID, col: c0 },
        wind: { directionDeg: 270, speedMs: wind10m },
        durationMin: (110 * CELL) / head.ros,
        ...rothermel,
      }),
    );
    const east = reach(arrivalMin, N, MID, c0, 0, 1);
    const west = reach(arrivalMin, N, MID, c0, 0, -1);
    let north = 0;
    for (let c = 0; c < N; c++)
      north = Math.max(north, reach(arrivalMin, N, MID, c, -1, 0));
    return {
      head,
      back,
      arrivalMin,
      c0,
      lbError: Math.abs(
        (east + west + 1) / (2 * north + 1) / head.lengthToBreadth - 1,
      ),
    };
  }

  it("wind: head and back fire match the Rothermel ellipse, and the shape has its length-to-breadth ratio", () => {
    const { head, back, arrivalMin, c0, lbError } = windShape(6);
    // Along the axis the straight path is nearly the fastest one: within 1% (the sectors of the moves
    // next to the axis can be marginally faster than the axis itself).
    expect(Math.abs(arrivalMin[at(MID, c0 + 50)] / ((50 * CELL) / head.ros) - 1)).toBeLessThan(0.01);
    expect(Math.abs(arrivalMin[at(MID, c0 - 5)] / ((5 * CELL) / back) - 1)).toBeLessThan(0.01);
    expect(lbError).toBeLessThan(0.1);
  });

  it("strong wind: the shape keeps its length-to-breadth ratio (32 directions with sectors)", () => {
    // With 8 neighbours this came out ~20% too narrow (2.8 instead of 2.3 at 14 m/s).
    for (const wind of [10, 14, 18]) {
      const { lbError } = windShape(wind);
      console.log(`wind ${wind} m/s: length-to-breadth error ${(lbError * 100).toFixed(1)}%`);
      // Sectors trade a slightly wider fire (up to ~13% here) for a head rate that no longer depends
      // on the wind's angle to the grid (stencil.test.ts).
      expect(lbError).toBeLessThan(0.15);
    }
  });

  it("wind makes the flanks faster too, unlike the legacy model", () => {
    const grid = makeGrid({ rows: N, cols: N, rothermel: grass });
    const run = (speedMs: number) =>
      simulate(
        grid,
        scenario({
          ignition: { row: MID, col: MID },
          wind: { directionDeg: 270, speedMs },
          durationMin: 20,
          ...rothermel,
        }),
      );
    const calm = reach(run(0).arrivalMin, N, MID, MID, -1, 0);
    const windy = reach(run(8).arrivalMin, N, MID, MID, -1, 0);
    expect(windy).toBeGreaterThan(calm);
  });

  it("slope: fire goes uphill faster than downhill", () => {
    const grid = makeGrid({
      rows: N,
      cols: N,
      rothermel: grass,
      elevation: (r) => (N - r) * CELL * 0.3,
    });
    const { arrivalMin } = simulate(
      grid,
      scenario({
        ignition: { row: MID, col: MID },
        durationMin: 30,
        ...rothermel,
      }),
    );
    expect(reach(arrivalMin, N, MID, MID, -1, 0)).toBeGreaterThan(
      reach(arrivalMin, N, MID, MID, 1, 0),
    );
  });

  it("drier fuel burns more", () => {
    const grid = makeGrid({ rows: N, cols: N, rothermel: grass });
    const burned = (d1: number) =>
      simulate(
        grid,
        scenario({
          ignition: { row: MID, col: MID },
          durationMin: 30,
          ...rothermel,
          moisture: { ...DEFAULT_MOISTURE, d1 },
        }),
      ).metrics.burnedHaByHour.at(-1)!;
    expect(burned(0.04)).toBeGreaterThan(burned(0.09));
    expect(burned(0.13)).toBe(0.01); // above grass's 12% moisture of extinction only the ignition cell (0.01 ha) burns
  });

  it("barriers and containment lines work as in the legacy model", () => {
    const grid = makeGrid({
      rows: N,
      cols: N,
      rothermel: grass,
      barrier: (_r, c) => c === MID + 10,
    });
    const { arrivalMin } = simulate(
      grid,
      scenario({
        ignition: { row: MID, col: MID },
        wind: { directionDeg: 270, speedMs: 10 },
        durationMin: 600,
        ...rothermel,
      }),
    );
    for (let r = 0; r < N; r++)
      for (let c = MID + 10; c < N; c++)
        expect(arrivalMin[at(r, c)]).toBe(Infinity);
  });

  it("the paired ensemble still pairs: identical decisions give zero gain in every run", () => {
    const grid = makeGrid({ rows: N, cols: N, rothermel: grass });
    const s = scenario({
      ignition: { row: MID, col: MID },
      wind: { directionDeg: 270, speedMs: 6 },
      durationMin: 20,
      ensemble: {
        runs: 10,
        windDirJitterDeg: 20,
        windSpeedJitterPct: 25,
        seed: 7,
      },
      ...rothermel,
    });
    const a = simulate(grid, s).runs!;
    const b = simulate(grid, s).runs!;
    const cmp = comparePaired(a, b, "burnedHa");
    expect(cmp.ties).toBe(10);
  });

  it("refuses a grid whose burnable fuels have no Rothermel parameters", () => {
    const grid = makeGrid({ rows: 11, cols: 11 });
    expect(() =>
      simulate(grid, scenario({ ignition: { row: 5, col: 5 }, ...rothermel })),
    ).toThrow(/faltam os parâmetros/);
  });

  it("legacy stays the default", () => {
    const grid = makeGrid({ rows: 41, cols: 41, rothermel: grass });
    const s = scenario({
      ignition: { row: 20, col: 20 },
      wind: { directionDeg: 270, speedMs: 6 },
      durationMin: 20,
    });
    expect(simulate(grid, s).arrivalMin).toEqual(
      simulate(grid, { ...s, spreadModel: "legacy" }).arrivalMin,
    );
  });
});

describe("wind adjustment from tree canopy cover", () => {
  it("follows BehavePlus: sheltered from ~15% cover, unsheltered below", async () => {
    const { windAdjustmentFactor, unshelteredWaf } =
      await import("../src/rothermel");
    // Same value as data-prep/fuel_params.py's sheltered_waf(0.5, 12).
    expect(windAdjustmentFactor(0.5, 0.5, 12)).toBeCloseTo(0.114, 3);
    expect(windAdjustmentFactor(0.5, 0.2, 12)).toBeGreaterThan(
      windAdjustmentFactor(0.5, 0.8, 12),
    );
    expect(windAdjustmentFactor(0.5, 0.1, 12)).toBe(unshelteredWaf(0.5)); // crown fill below 5%
    expect(windAdjustmentFactor(0.5, 0.8, 1.5)).toBe(unshelteredWaf(0.5)); // canopy under 6 ft
  });

  it("a fire under dense canopy runs slower downwind than in the open", () => {
    const litter: FuelParams = { ...ANDERSON_13[9], underCanopy: true };
    const run = (cover: number, fuel = litter) => {
      const grid = makeGrid({
        rows: N,
        cols: N,
        rothermel: fuel,
        canopy: () => cover,
      });
      const { arrivalMin } = simulate(
        grid,
        scenario({
          ignition: { row: MID, col: 20 },
          wind: { directionDeg: 270, speedMs: 8 },
          durationMin: 120,
          ...rothermel,
        }),
      );
      return reach(arrivalMin, N, MID, 20, 0, 1);
    };
    const open = run(0);
    expect(run(80)).toBeLessThan(open);
    expect(run(255)).toBe(open); // 255 = no data: the fuel model's own factor (unsheltered here)
    // Shrub and grass models are the fuel themselves: tree cover does not shelter them.
    const shrub = ANDERSON_13[4];
    expect(run(80, shrub)).toBe(run(0, shrub));
  });
});

describe("weather that changes during the fire", () => {
  const grid = makeGrid({ rows: N, cols: N, rothermel: grass });
  const west = { directionDeg: 270, speedMs: 6 };
  const south = { directionDeg: 180, speedMs: 6 };
  const base = {
    ignition: { row: MID, col: MID },
    durationMin: 60,
    ...rothermel,
  };

  it("a single step at minute 0 is the same as a constant wind", () => {
    const constant = simulate(
      grid,
      scenario({ ...base, wind: west }),
    ).arrivalMin;
    const stepped = simulate(
      grid,
      scenario({ ...base, wind: south, weatherSteps: [{ fromMin: 0, wind: west }] }),
    ).arrivalMin;
    expect(Array.from(stepped)).toEqual(Array.from(constant));
  });

  it("a wind shift changes the fire only after it happens", () => {
    const constant = simulate(
      grid,
      scenario({ ...base, wind: west }),
    ).arrivalMin;
    const shifted = simulate(
      grid,
      scenario({
        ...base,
        wind: west,
        weatherSteps: [
          { fromMin: 0, wind: west },
          { fromMin: 30, wind: south },
        ],
      }),
    ).arrivalMin;
    // Cells burned before minute 30 burn at the same time.
    for (let i = 0; i < constant.length; i++)
      if (constant[i] < 30) expect(shifted[i]).toBe(constant[i]);
    // After the shift to a south wind the fire runs north.
    expect(reach(shifted, N, MID, MID, -1, 0)).toBeGreaterThan(
      reach(constant, N, MID, MID, -1, 0),
    );
  });

  it("fuel that turns wet stops the spread (Rothermel moisture per step)", () => {
    const dry = {
      d1: 0.05,
      d10: 0.06,
      d100: 0.07,
      liveHerb: 0.3,
      liveWoody: 0.9,
    };
    const wet = { ...dry, d1: 0.2, d10: 0.2, d100: 0.2 }; // above grass's 12% moisture of extinction
    const burned = (weatherSteps: Parameters<typeof scenario>[0]["weatherSteps"]) =>
      simulate(
        grid,
        scenario({ ...base, wind: west, weatherSteps }),
      ).metrics.burnedHaByHour.at(-1)!;
    const allDry = burned([{ fromMin: 0, wind: west, moisture: dry }]);
    const wetAfter20 = burned([
      { fromMin: 0, wind: west, moisture: dry },
      { fromMin: 20, wind: west, moisture: wet },
    ]);
    expect(wetAfter20).toBeLessThan(allDry);
    expect(wetAfter20).toBeGreaterThan(0.01);
  });

  it("the paired ensemble perturbs every step alike and still pairs", () => {
    const s = scenario({
      ...base,
      wind: west,
      weatherSteps: [
        { fromMin: 0, wind: west },
        { fromMin: 20, wind: south },
      ],
      ensemble: {
        runs: 8,
        windDirJitterDeg: 20,
        windSpeedJitterPct: 25,
        seed: 3,
      },
    });
    const a = simulate(grid, s).runs!;
    expect(comparePaired(a, simulate(grid, s).runs!, "burnedHa").ties).toBe(8);
    // Without weather steps the draws are the same as before steps existed.
    const plain = scenario({ ...base, wind: west, ensemble: s.ensemble });
    const viaSteps = { ...plain, weatherSteps: [{ fromMin: 0, wind: west }] };
    expect(simulate(grid, viaSteps).runs).toEqual(simulate(grid, plain).runs);
  });

  it("works with the legacy model too", () => {
    const legacy = { ignition: { row: MID, col: MID }, durationMin: 60 };
    const constant = simulate(
      grid,
      scenario({ ...legacy, wind: west }),
    ).arrivalMin;
    const shifted = simulate(
      grid,
      scenario({
        ...legacy,
        wind: west,
        weatherSteps: [
          { fromMin: 0, wind: west },
          { fromMin: 30, wind: south },
        ],
      }),
    ).arrivalMin;
    expect(reach(shifted, N, MID, MID, -1, 0)).toBeGreaterThan(
      reach(constant, N, MID, MID, -1, 0),
    );
  });
});
