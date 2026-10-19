import { describe, expect, it } from "vitest";
import { ANDERSON_13 } from "../src/fuelModels";
import { rasterizePolyline } from "../src/geometry";
import { nearestBurnable, prepareGrid } from "../src/grid";
import {
  DEFAULT_MOISTURE,
  prepareFuelBed,
  surfaceBase,
} from "../src/rothermel";
import { simulate } from "../src/simulate";
import { computeArrivalRothermel, crossedCells, STENCIL_16 } from "../src/spreadRothermel";
import { buildInterventionLayers } from "../src/interventions";
import { MinHeap } from "../src/heap";
import { DEFAULT_PARAMS } from "../src/params";
import { fuelBases, RothermelRates } from "../src/surface";
import { makeGrid, scenario } from "./helpers";

const N = 81;
const MID = 40;
const CELL = 10;
const at = (r: number, c: number) => r * N + c;
const grass = ANDERSON_13[1];
const rothermel = { spreadModel: "rothermel" as const };

describe("16-neighbour stencil", () => {
  it("knight moves cross four cells, a quarter of the line in each (as derived by hand)", () => {
    expect(crossedCells(2, 1)).toEqual([
      { dr: 0, dc: 0, frac: 0.25 },
      { dr: 1, dc: 0, frac: 0.25 },
      { dr: 1, dc: 1, frac: 0.25 },
      { dr: 2, dc: 1, frac: 0.25 },
    ]);
    // Axis and diagonal moves only touch the two cells (the diagonal passes through the shared corner).
    expect(crossedCells(0, 1)).toEqual([
      { dr: 0, dc: 0, frac: 0.5 },
      { dr: 0, dc: 1, frac: 0.5 },
    ]);
    expect(crossedCells(1, 1)).toEqual([
      { dr: 0, dc: 0, frac: 0.5 },
      { dr: 1, dc: 1, frac: 0.5 },
    ]);
  });

  it("has 16 distinct directions, about 22.5° apart", () => {
    const bearings = STENCIL_16.map((m) => m.bearingDeg).sort((a, b) => a - b);
    expect(new Set(bearings).size).toBe(16);
    expect(
      STENCIL_16.find((m) => m.dr === -2 && m.dc === 1)!.bearingDeg,
    ).toBeCloseTo(26.565, 3);
    const gaps = bearings.map(
      (b, k) => (bearings[(k + 1) % 16] - b + 360) % 360,
    );
    expect(Math.max(...gaps)).toBeLessThan(27);
  });

  it("a step between two fuels takes half its length at each fuel's rate", () => {
    const base = makeGrid({ rows: N, cols: N, rothermel: grass });
    const litter = ANDERSON_13[9];
    const data = {
      ...base,
      header: {
        ...base.header,
        fuelTable: {
          ...base.header.fuelTable,
          2: { label: "Folhada", baseRate: 3, rothermel: litter },
        },
      },
    };
    data.fuel = data.fuel.map((f, i) => (i % N >= MID ? 2 : f));
    const grid = prepareGrid(data);
    const { arrivalMin } = simulate(
      grid,
      scenario({
        ignition: { row: MID, col: MID - 1 },
        durationMin: 600,
        ...rothermel,
      }),
    );
    const r0 = (p: typeof grass) =>
      surfaceBase(prepareFuelBed(p), DEFAULT_MOISTURE).r0;
    expect(arrivalMin[at(MID, MID)]).toBeCloseTo(
      CELL / 2 / r0(grass) + CELL / 2 / r0(litter),
      3,
    );
  });

  it("long steps cannot jump a one-cell oblique barrier or containment line", () => {
    // A 4-connected line at about 30°, across the whole grid, east of the ignition, with a strong west wind.
    const line = rasterizePolyline(
      [
        { x: 50, y: 0 },
        { x: 50 + N / Math.tan((60 * Math.PI) / 180), y: N },
      ],
      N,
      N,
    );
    const onLine = new Set(line.map(({ row, col }) => at(row, col)));
    const east = (arrival: Float32Array) => {
      let crossed = 0;
      for (const { row, col } of line)
        for (let c = col + 1; c < N; c++)
          if (arrival[at(row, c)] < Infinity) crossed++;
      return crossed;
    };
    const wind = { directionDeg: 270, speedMs: 15 };
    const barrierGrid = makeGrid({
      rows: N,
      cols: N,
      rothermel: grass,
      barrier: (r, c) => onLine.has(at(r, c)),
    });
    const s = scenario({
      ignition: { row: MID, col: 20 },
      wind,
      durationMin: 600,
      ...rothermel,
    });
    expect(east(simulate(barrierGrid, s).arrivalMin)).toBe(0);
    const open = makeGrid({ rows: N, cols: N, rothermel: grass });
    const lined = simulate(open, {
      ...s,
      interventions: [{ kind: "containmentLine", cells: line, startMin: 0 }],
    }).arrivalMin;
    expect(east(lined)).toBe(0);
    expect(east(simulate(open, s).arrivalMin)).toBeGreaterThan(0); // without them the fire does cross
  });
});

describe("several ignitions", () => {
  it("each burns from its own minute (e.g. a perimeter or a spot fire)", () => {
    const grid = makeGrid({ rows: N, cols: N, rothermel: grass });
    for (const model of [{}, rothermel]) {
      const sc = {
        ...scenario({
          ignition: { row: 10, col: 10 },
          durationMin: 60,
          ...model,
        }),
      };
      const two = simulate(grid, {
        ...sc,
        ignitions: [
          { cell: { row: 10, col: 10 }, t0Min: 0 },
          { cell: { row: 70, col: 70 }, t0Min: 30 },
        ],
      }).arrivalMin;
      expect(two[at(70, 70)]).toBe(30);
      expect(two[at(70, 71)]).toBeGreaterThan(30);
      expect(two[at(10, 10)]).toBe(0);
    }
  });
});

describe("head rate and area at any wind angle (32 directions with sectors)", () => {
  // A very elongated fire (shrub, strong wind, length-to-breadth ratio 8): with exact directions the
  // head lost up to 77% of its rate when the wind fell between two stencil directions.
  const N = 241,
    C = 120;
  const grid = makeGrid({ rows: N, cols: N, cellSize: 30, rothermel: ANDERSON_13[4] });
  const m = { d1: 0.04, d10: 0.05, d100: 0.06, liveHerb: 0.6, liveWoody: 0.9 };
  const p = { ...DEFAULT_PARAMS, windAdj: 2.5 };
  const bases = fuelBases(grid, m, p);
  const layers = buildInterventionLayers([], N, N);
  const heap = new MinHeap(N * N);

  for (const off of [0, 4, 9, 13, 20, 33, 45]) {
    it(`wind ${off}° off the grid axis: head within 0.8–1.02 and area within 0.75–1.35 of the ellipse`, () => {
      const from = 270 + off;
      const rates = new RothermelRates(grid, bases, p.windAdj);
      rates.setConditions(10, from, bases);
      const to = (((from + 180) % 360) * Math.PI) / 180;
      const head = rates.rate(C * N + C, Math.cos(to), Math.sin(to));
      const back = rates.rate(C * N + C, -Math.cos(to), -Math.sin(to));
      const T = (90 * 30) / head;
      const a = computeArrivalRothermel(
        grid,
        { ignition: { row: C, col: C }, windDirectionDeg: from, windSpeedMs: 10, durationMin: T, params: p, rates, bases },
        layers,
        heap,
      );
      let far = 0,
        area = 0;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (a[r * N + c] <= T) {
            far = Math.max(far, (c - C) * Math.sin(to) - (r - C) * Math.cos(to));
            area++;
          }
      const e = (head - back) / (head + back);
      const semi = ((head + back) * T) / 2 / 30;
      const ellipse = Math.PI * semi * semi * Math.sqrt(1 - e * e);
      const headRatio = (far * 30) / (head * T);
      expect(headRatio).toBeGreaterThan(0.8);
      expect(headRatio).toBeLessThan(1.02);
      expect(area / ellipse).toBeGreaterThan(0.75);
      expect(area / ellipse).toBeLessThan(1.35);
    });
  }
});

describe("ignition on a road or a non-burnable cell", () => {
  it("starts on the nearest burnable cell, in the deterministic run and in every ensemble run", () => {
    // A 7 m road along column 30 (barrier 7 = breakable strip of 7 m); the ignition is on the road.
    const base = makeGrid({ rows: 61, cols: 61, rothermel: ANDERSON_13[1] });
    const grid = prepareGrid({ ...base, barrier: base.barrier.map((_, i) => (i % 61 === 30 ? 7 : 0)) });
    const s = scenario({
      ignition: { row: 30, col: 30 },
      wind: { directionDeg: 270, speedMs: 3 },
      durationMin: 20,
      spreadModel: "rothermel",
      ensemble: { runs: 5, windDirJitterDeg: 10, windSpeedJitterPct: 10, seed: 1 },
    });
    const r = simulate(grid, s);
    expect(r.arrivalMin.filter((a) => a <= 20).length).toBeGreaterThan(10);
    for (const run of r.runs!) expect(run.burnedHa).toBeGreaterThan(0);
  });

  it("nearestBurnable: itself when it burns, a neighbour when not, null when nothing burns nearby", () => {
    const grid = makeGrid({ rows: 11, cols: 11, rothermel: ANDERSON_13[1], barrier: (r, c) => c === 5 });
    expect(nearestBurnable(grid, { row: 5, col: 4 })).toEqual({ row: 5, col: 4 });
    const n = nearestBurnable(grid, { row: 5, col: 5 })!;
    expect(Math.abs(n.col - 5)).toBe(1);
    const none = makeGrid({ rows: 11, cols: 11, rothermel: ANDERSON_13[1], barrier: () => true });
    expect(nearestBurnable(none, { row: 5, col: 5 })).toBeNull();
  });
});
