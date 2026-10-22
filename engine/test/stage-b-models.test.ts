import { describe, expect, it } from "vitest";
import { ANDERSON_13 } from "../src/fuel-models";
import { andersonShrubRate, lengthToBreadthTaylor } from "../src/rothermel";
import { terrainWind } from "../src/terrain-wind";
import { simulate } from "../src/simulate";
import type { Scenario } from "../src/types";
import { makeGrid } from "./helpers";

describe("Anderson et al. (2015) shrubland rate (Cruz et al. 2015, eq. 4.5)", () => {
  it("follows the published formula above 5 km/h", () => {
    const expected = 5.67 * Math.pow(0.67 * 20, 0.91) * Math.pow(1.5, 0.22) * Math.exp(-0.076 * 5);
    expect(andersonShrubRate(20, 1.5, 5)).toBeCloseTo(expected, 10);
  });
  it("is continuous at 5 km/h and starts from R0 = 5 m/min (times the fuel terms) in calm air", () => {
    expect(andersonShrubRate(4.999999, 1, 10)).toBeCloseTo(andersonShrubRate(5, 1, 10), 4);
    expect(andersonShrubRate(0, 1, 0)).toBeCloseTo(5, 10);
  });
  it("is faster with wind and taller shrubs, slower with wetter fuel", () => {
    expect(andersonShrubRate(30, 1, 8)).toBeGreaterThan(andersonShrubRate(15, 1, 8));
    expect(andersonShrubRate(20, 2, 8)).toBeGreaterThan(andersonShrubRate(20, 0.5, 8));
    expect(andersonShrubRate(20, 1, 15)).toBeLessThan(andersonShrubRate(20, 1, 5));
  });
});

describe("length-to-breadth from the 10-m wind (Taylor et al. 1997, as tabulated in Cruz et al. 2015)", () => {
  // The guide's table (forest, grassland) at 0, 10, 20, 30, 40, 50 km/h.
  const table: [number, number, number][] = [
    [0, 1.0, 1.0],
    [10, 1.5, 3.2],
    [20, 2.6, 4.4],
    [30, 3.8, 5.3],
    [40, 5.0, 6.1],
    [50, 6.1, 6.8],
  ];
  it.each(table)("at %i km/h: forest %f, grassland %f", (u, forest, grass) => {
    expect(lengthToBreadthTaylor(u, true)).toBeCloseTo(forest, 1);
    expect(lengthToBreadthTaylor(u, false)).toBeCloseTo(grass, 1);
  });
});

describe("the stage B switches", () => {
  const N = 41;
  // NFFL 4 as an open shrubland (group V).
  const shrub = makeGrid({ rows: N, cols: N, cellSize: 30, rothermel: { ...ANDERSON_13[4], group: "V" } });
  const sc = (params: Scenario["params"] = {}): Scenario => ({
    ignition: { row: 20, col: 20 },
    wind: { directionDeg: 270, speedMs: 6 },
    durationMin: 30,
    interventions: [],
    spreadModel: "rothermel",
    params,
  });
  const burned = (a: Float32Array) => a.filter((t) => t <= 30).length;

  it("are off by default: the same result as before", () => {
    const off = simulate(shrub, sc());
    const explicit = simulate(shrub, sc({ shrubModel: 0, shapeModel: 0 }));
    expect(Array.from(explicit.arrivalMin)).toEqual(Array.from(off.arrivalMin));
  });

  it("the shrubland model changes the spread in group V, and the explanation still adds up", () => {
    const base = simulate(shrub, sc());
    const anderson = simulate(shrub, { ...sc({ shrubModel: 1 }), explain: true });
    expect(burned(anderson.arrivalMin)).not.toBe(burned(base.arrivalMin));
    const j = 20 * N + 30;
    const e = anderson.explain!;
    expect(e.headRate[j]).toBeCloseTo(e.r0[j] * (1 + e.windPart[j] + e.slopePart[j]), 4);
  });

  it("the Taylor shape makes a wind-driven fire in the open narrower than a calm one", () => {
    const windy = simulate(shrub, sc({ shapeModel: 1 }));
    const calm = simulate(shrub, { ...sc({ shapeModel: 1 }), wind: { directionDeg: 270, speedMs: 0 } });
    // Downwind reach over crosswind reach (in cells).
    const extent = (a: Float32Array) => {
      let east = 0, north = 0;
      for (let c = 20; c < N && a[20 * N + c] <= 30; c++) east = c - 20;
      for (let r = 20; r >= 0 && a[r * N + 20] <= 30; r--) north = 20 - r;
      return east / Math.max(1, north);
    };
    expect(extent(windy.arrivalMin)).toBeGreaterThan(extent(calm.arrivalMin));
  });
});

describe("wind over the relief (MicroMet, M8)", () => {
  const N = 41;
  it("leaves the wind alone on flat ground", () => {
    const flat = makeGrid({ rows: N, cols: N, cellSize: 100, rothermel: ANDERSON_13[1] });
    const w = terrainWind(flat, 270);
    expect(Math.max(...w.speedFactor)).toBeCloseTo(1, 6);
    expect(Math.min(...w.speedFactor)).toBeCloseTo(1, 6);
    expect(w.fromDeg[20 * N + 20]).toBeCloseTo(270, 6);
  });

  it("speeds up the windward slope and the ridge, slows the lee and the valley", () => {
    // A north-south ridge along column 20: rising from both sides (300 m over 2 km).
    const ridge = makeGrid({ rows: N, cols: N, cellSize: 100, rothermel: ANDERSON_13[1], elevation: (_r, c) => 300 - 15 * Math.abs(c - 20) });
    const w = terrainWind(ridge, 270); // from the west
    const at = (c: number) => w.speedFactor[20 * N + c];
    expect(at(14)).toBeGreaterThan(1); // west side, facing the wind
    expect(at(26)).toBeLessThan(at(14)); // east side, in the lee
    expect(at(20)).toBeGreaterThan(1); // the crest
    const valley = makeGrid({ rows: N, cols: N, cellSize: 100, rothermel: ANDERSON_13[1], elevation: (_r, c) => 15 * Math.abs(c - 20) });
    expect(terrainWind(valley, 0).speedFactor[20 * N + 20]).toBeLessThan(1); // valley floor, wind along it
  });

  it("is off by default, and on changes the spread over relief", () => {
    const hill = makeGrid({ rows: N, cols: N, cellSize: 100, rothermel: ANDERSON_13[1], elevation: (_r, c) => 300 - 15 * Math.abs(c - 20) });
    const sc: Scenario = { ignition: { row: 20, col: 10 }, wind: { directionDeg: 270, speedMs: 6 }, durationMin: 60, interventions: [], spreadModel: "rothermel" };
    const off = simulate(hill, sc);
    const zero = simulate(hill, { ...sc, params: { terrainWind: 0 } });
    expect(Array.from(zero.arrivalMin)).toEqual(Array.from(off.arrivalMin));
    const on = simulate(hill, { ...sc, params: { terrainWind: 1 } });
    expect(Array.from(on.arrivalMin)).not.toEqual(Array.from(off.arrivalMin));
  });
});
