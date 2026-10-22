import { describe, expect, it } from "vitest";
import { explainPath, firePath } from "../src/explain";
import { ANDERSON_13 } from "../src/fuel-models";
import { headFire, prepareFuelBed, surfaceBase, DEFAULT_MOISTURE } from "../src/rothermel";
import { simulate } from "../src/simulate";
import type { Scenario } from "../src/types";
import { makeGrid } from "./helpers";

const N = 41;
const grass = ANDERSON_13[1];
const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  ignition: { row: 20, col: 20 },
  wind: { directionDeg: 270, speedMs: 6 }, // from the west: the head runs east
  durationMin: 60,
  interventions: [],
  spreadModel: "rothermel",
  explain: true,
  ...over,
});
const at = (r: number, c: number) => r * N + c;

describe("head fire split into fuel, wind and slope", () => {
  it("the parts add up to the head rate, before and after the wind limit", () => {
    const base = surfaceBase(prepareFuelBed(grass, DEFAULT_MOISTURE), DEFAULT_MOISTURE);
    for (const [wind, windTo, slope, up] of [
      [3, 90, 0, 0],
      [0, 0, 0.4, 45],
      [4, 0, 0.5, 180], // wind up a slope that faces the other way
      [40, 90, 0.2, 90], // strong enough for the wind limit
    ]) {
      const h = headFire(base, wind, windTo, slope, up);
      expect(h.ros).toBeCloseTo(base.r0 * (1 + h.windPart + h.slopePart), 6);
    }
    const against = headFire(base, 4, 0, 0.2, 180);
    expect(against.slopePart).toBeLessThan(0); // the head runs downhill, with the wind
  });
});

describe("explaining a result", () => {
  const flat = makeGrid({ rows: N, cols: N, rothermel: grass });

  it("does not change the simulation", () => {
    const a = simulate(flat, scenario());
    const b = simulate(flat, scenario({ explain: undefined }));
    expect(Array.from(a.arrivalMin)).toEqual(Array.from(b.arrivalMin));
    expect(b.explain).toBeUndefined();
  });

  it("the path goes from the ignition to the cell, always forward in time", () => {
    const r = simulate(flat, scenario());
    const target = at(20, 32);
    const path = firePath(r.explain!, r.arrivalMin, target);
    expect(path[0]).toBe(at(20, 20));
    expect(path[path.length - 1]).toBe(target);
    for (let k = 1; k < path.length; k++) expect(r.arrivalMin[path[k]]).toBeGreaterThan(r.arrivalMin[path[k - 1]]);
    // Upwind corner, far beyond a backing fire's hour: not reached, no path.
    expect(Number.isFinite(r.arrivalMin[at(0, 0)])).toBe(false);
    expect(firePath(r.explain!, r.arrivalMin, at(0, 0))).toEqual([]);
  });

  it("on flat ground with wind, the wind explains most of the head run and there is no slope", () => {
    const r = simulate(flat, scenario());
    const e = explainPath(flat, r.explain!, r.arrivalMin, at(20, 32))!;
    expect(e.shares.wind).toBeGreaterThan(0.5);
    expect(Math.abs(e.shares.slope)).toBeLessThan(1e-6);
    expect(e.shares.fuel + e.shares.wind + e.shares.slope).toBeCloseTo(1, 6);
    expect(e.headShare).toBeGreaterThan(0.9); // straight downwind, at the head
    expect(e.meanRateMMin).toBeCloseTo(e.lengthM / (e.arrivalMin - e.startMin), 6);
    expect(e.fuels).toEqual([{ code: 1, share: 1 }]);
    // Upwind, the fire backs: far from the head.
    const back = explainPath(flat, r.explain!, r.arrivalMin, at(20, 17))!;
    expect(back.headShare).toBeLessThan(0.5);
  });

  it("with no wind on a slope, the slope is the cause", () => {
    // Rising to the east, 30% (3 m per 10 m cell).
    const hill = makeGrid({ rows: N, cols: N, rothermel: grass, elevation: (_r, c) => 3 * c });
    const r = simulate(hill, scenario({ wind: { directionDeg: 0, speedMs: 0 } }));
    const e = explainPath(hill, r.explain!, r.arrivalMin, at(20, 30))!;
    expect(e.shares.slope).toBeGreaterThan(0.1);
    expect(e.shares.wind).toBe(0);
  });

  it("marks the steps an attack slowed", () => {
    const cells = [];
    for (let r = 10; r <= 30; r++) for (let c = 24; c <= 28; c++) cells.push({ row: r, col: c });
    const r = simulate(flat, scenario({ interventions: [{ kind: "suppression", cells, rateFactor: 0.2, startMin: 0 }] }));
    const e = explainPath(flat, r.explain!, r.arrivalMin, at(20, 32))!;
    expect(e.slowedShare).toBeGreaterThan(0);
  });
});
