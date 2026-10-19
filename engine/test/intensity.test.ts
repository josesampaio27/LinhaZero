import { describe, expect, it } from "vitest";
import { ANDERSON_13 } from "../src/fuelModels";
import { comparePaired } from "../src/metrics";
import {
  attackEffectiveness,
  DEFAULT_PARAMS,
  holdProbability,
} from "../src/params";
import { simulate } from "../src/simulate";
import type { Intervention, Scenario } from "../src/types";
import { makeGrid, scenario } from "./helpers";

const N = 81;
const MID = 40;
const at = (r: number, c: number) => r * N + c;
const rothermel = { spreadModel: "rothermel" as const };
const litter = ANDERSON_13[8]; // closed timber litter: ~10 kW/m
const chaparral = ANDERSON_13[4]; // chaparral: tens of thousands of kW/m in strong wind
const westWind = { directionDeg: 270, speedMs: 10 };

/** A north-south line of cells at column col. */
const column = (col: number) =>
  Array.from({ length: N }, (_, row) => ({ row, col }));

describe("intensity rules", () => {
  it("ground crews: full effect up to 500 kW/m, none from 4000 kW/m, linear in between", () => {
    expect(attackEffectiveness(300, DEFAULT_PARAMS)).toBe(1);
    expect(attackEffectiveness(2250, DEFAULT_PARAMS)).toBeCloseTo(0.5, 9);
    expect(attackEffectiveness(5000, DEFAULT_PARAMS)).toBe(0);
  });

  it("a line holds with 50% probability when its width equals the flame length", () => {
    expect(holdProbability(3, 3, DEFAULT_PARAMS)).toBeCloseTo(0.5, 9);
    expect(holdProbability(10, 2, DEFAULT_PARAMS)).toBeGreaterThan(0.99);
    expect(holdProbability(1, 10, DEFAULT_PARAMS)).toBeLessThan(0.1);
    expect(holdProbability(1, 0, DEFAULT_PARAMS)).toBe(1);
  });
});

describe("fireline intensity output", () => {
  it("is reported where the fire arrives, higher downwind (head) than upwind (back)", () => {
    const grid = makeGrid({ rows: N, cols: N, rothermel: chaparral });
    const r = simulate(
      grid,
      scenario({
        ignition: { row: MID, col: MID },
        wind: westWind,
        durationMin: 30,
        ...rothermel,
      }),
    );
    const I = r.intensityKwM!;
    expect(I[at(MID, MID + 5)]).toBeGreaterThan(4 * I[at(MID, MID - 2)]);
    for (let i = 0; i < I.length; i++)
      if (!(r.arrivalMin[i] < Infinity)) expect(I[i]).toBe(0);
    expect(
      simulate(
        grid,
        scenario({ ignition: { row: MID, col: MID }, durationMin: 30 }),
      ).intensityKwM,
    ).toBeUndefined();
  });
});

describe("interventions against an intense fire (Rothermel)", () => {
  const attackZone = (from: number, to: number): Intervention => {
    const cells = [];
    for (let r = 0; r < N; r++)
      for (let c = from; c <= to; c++) cells.push({ row: r, col: c });
    return { kind: "suppression", cells, startMin: 0, rateFactor: 0.2 };
  };
  const delay = (fuel: typeof litter, durationMin: number) => {
    const grid = makeGrid({ rows: N, cols: N, rothermel: fuel });
    const s: Scenario = scenario({
      ignition: { row: MID, col: 5 },
      wind: westWind,
      durationMin,
      ...rothermel,
    });
    const target = at(MID, 30);
    const free = simulate(grid, s).arrivalMin[target];
    const attacked = simulate(grid, {
      ...s,
      interventions: [attackZone(10, 25)],
    }).arrivalMin[target];
    return attacked / free;
  };

  it("an attack slows a weak fire about 5× but does nothing against a fire above 4000 kW/m", () => {
    expect(delay(litter, 6000)).toBeGreaterThan(3);
    expect(delay(chaparral, 600)).toBeCloseTo(1, 6);
  });

  const lineScenario = (
    fuel: typeof litter,
    widthM: number,
    ensemble = false,
  ) => {
    const grid = makeGrid({ rows: N, cols: N, rothermel: fuel });
    const s: Scenario = scenario({
      ignition: { row: MID, col: 10 },
      wind: westWind,
      durationMin: 6000,
      ...rothermel,
      interventions: [
        { kind: "containmentLine", cells: column(30), startMin: 0, widthM },
      ],
      ensemble: ensemble
        ? { runs: 20, windDirJitterDeg: 10, windSpeedJitterPct: 10, seed: 11 }
        : undefined,
    });
    return { grid, s };
  };
  const crossed = (arrival: Float32Array) => arrival[at(MID, 35)] < Infinity;

  it("a containment line holds against a weak fire and is breached by long flames unless it is wide enough", () => {
    const run = (fuel: typeof litter, w: number) => {
      const { grid, s } = lineScenario(fuel, w);
      return crossed(simulate(grid, s).arrivalMin);
    };
    expect(run(litter, 2)).toBe(false);
    expect(run(chaparral, 2)).toBe(true);
    expect(run(chaparral, 200)).toBe(false);
  });

  it("in the ensemble, a line breaks in some runs and holds in others, and the pairing still holds", () => {
    // Each line cell has its own draw, so a long line is as strong as its weakest stretch: with a 50%
    // chance per cell it breaks in every run. A width of ~2.2 flame lengths holds ~97% per cell.
    const { grid, s } = lineScenario(chaparral, 2);
    const flame = (I: number) => 0.0775 * Math.pow(I, 0.46);
    const I = simulate(grid, { ...s, interventions: [] }).intensityKwM![
      at(MID, 29)
    ];
    const { s: wide } = lineScenario(chaparral, 2.16 * flame(I), true);
    const r = simulate(grid, wide);
    const burnedBeyond = r.burnProbability![at(MID, 35)];
    expect(burnedBeyond).toBeGreaterThan(0);
    expect(burnedBeyond).toBeLessThan(1);
    expect(
      comparePaired(r.runs!, simulate(grid, wide).runs!, "burnedHa").ties,
    ).toBe(20);
  });

  it("a breakable road (barrier = width in m) stops a weak fire and is crossed by an intense one", () => {
    const run = (fuel: typeof litter) => {
      const grid = makeGrid({ rows: N, cols: N, rothermel: fuel });
      for (let r = 0; r < N; r++) grid.barrier[at(r, 30)] = 7; // a 7 m road
      grid.baseRate.forEach((_, i) => {
        if (grid.barrier[i] !== 0) grid.baseRate[i] = 0;
      });
      return crossed(
        simulate(
          grid,
          scenario({
            ignition: { row: MID, col: 10 },
            wind: westWind,
            durationMin: 6000,
            ...rothermel,
          }),
        ).arrivalMin,
      );
    };
    expect(run(litter)).toBe(false);
    expect(run(chaparral)).toBe(true);
  });
});

describe("spot fires (Rothermel ensemble)", () => {
  it("embers land at the Sardoy distances (ELMFIRE's implementation)", async () => {
    const { spotDistribution } = await import("../src/spotting");
    const d = spotDistribution(10000, 10); // 10 MW/m, 10 m/s: high Froude number branch
    expect(Math.exp(d.mu)).toBeCloseTo(21.6, 0);
    expect(Math.exp(d.mu + 1.645 * d.sigma)).toBeGreaterThan(130);
    expect(Math.exp(d.mu + 1.645 * d.sigma)).toBeLessThan(150);
  });

  // A 3-cell river across the grid (a hard barrier): the spread stops; only embers can cross it.
  const riverGrid = () =>
    makeGrid({
      rows: N,
      cols: N,
      rothermel: chaparral,
      barrier: (_r, c) => c >= 40 && c <= 42,
    });
  const s = (params?: Scenario["params"]): Scenario =>
    scenario({
      ignition: { row: MID, col: 10 },
      wind: { directionDeg: 270, speedMs: 12 },
      durationMin: 120,
      ...rothermel,
      params,
      ensemble: {
        runs: 20,
        windDirJitterDeg: 10,
        windSpeedJitterPct: 10,
        seed: 5,
      },
    });
  const beyond = (p: Float32Array) => {
    let m = 0;
    for (let r = 0; r < N; r++)
      for (let c = 43; c < N; c++) m = Math.max(m, p[at(r, c)]);
    return m;
  };

  it("jump a river that stops the spread, in some runs; never in the main run or with spotting off", () => {
    const grid = riverGrid();
    const r = simulate(grid, s());
    expect(beyond(r.burnProbability!)).toBeGreaterThan(0);
    for (let c = 43; c < N; c++)
      expect(r.arrivalMin[at(MID, c)]).toBe(Infinity); // main run: no embers
    expect(beyond(simulate(grid, s({ spotPerHa: 0 })).burnProbability!)).toBe(
      0,
    );
  });

  it("keep the ensemble paired", () => {
    const grid = riverGrid();
    expect(
      comparePaired(
        simulate(grid, s()).runs!,
        simulate(grid, s()).runs!,
        "burnedHa",
      ).ties,
    ).toBe(20);
  });
});
