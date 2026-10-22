import { describe, expect, it } from "vitest";
import { ANDERSON_13 } from "../src/fuel-models";
import { projectedToGrid } from "../src/grid";
import { suggestLines } from "../src/suggest";
import type { Scenario } from "../src/types";
import { makeGrid } from "./helpers";

// 61 x 61 cells of 30 m; a village with buildings in the east, the fire lit in the west, wind from the west.
const N = 61;
const grid = makeGrid({
  rows: N,
  cols: N,
  cellSize: 30,
  rothermel: ANDERSON_13[1],
  buildings: (r, c) => (c >= 50 && Math.abs(r - 30) <= 4 ? 3 : 0),
  village: (r, c) => (c >= 50 && Math.abs(r - 30) <= 4 ? 1 : 0),
});
const scenario: Scenario = {
  ignition: { row: 30, col: 5 },
  wind: { directionDeg: 270, speedMs: 8 },
  durationMin: 180,
  interventions: [],
  spreadModel: "rothermel",
};

describe("suggesting a third decision (M10)", () => {
  it("finds a line across the path to the village that spares its buildings", () => {
    const r = suggestLines(grid, scenario, { readyMin: 10, widthM: 25 });
    expect(r.base.buildingsReached).toBeGreaterThan(0);
    expect(r.tried).toBeGreaterThan(0);
    expect(r.suggestions.length).toBeGreaterThan(0);
    const best = r.suggestions[0];
    expect(best.buildingsSaved).toBeGreaterThan(0);
    expect(best.target).toBe("Aldeia");
    expect(best.startMin).toBe(10);
    expect(best.widthM).toBe(25);
    // One line per crossing of the fire's path.
    expect(new Set(r.suggestions.map((s) => s.crossing)).size).toBe(r.suggestions.length);
    // Best first.
    for (let k = 1; k < r.suggestions.length; k++) expect(r.suggestions[k].buildingsSaved).toBeLessThanOrEqual(best.buildingsSaved);
    // Between the fire and the village, roughly across the wind.
    const ends = best.coords.map(([x, y]) => projectedToGrid(grid.header, x, y));
    const midCol = (ends[0].x + ends[1].x) / 2;
    expect(midCol).toBeGreaterThan(5);
    expect(midCol).toBeLessThan(50);
    expect(Math.abs(ends[0].y - ends[1].y)).toBeGreaterThan(Math.abs(ends[0].x - ends[1].x));
  });

  it("keeps the decision's own actions and only adds the line", () => {
    const own: Scenario = { ...scenario, interventions: [{ kind: "suppression", cells: [{ row: 30, col: 8 }], rateFactor: 0.2, startMin: 0 }] };
    const r = suggestLines(grid, own, { readyMin: 10, widthM: 25 });
    expect(r.suggestions.every((s) => s.metrics.buildingsReached <= r.base.buildingsReached)).toBe(true);
  });

  it("suggests nothing when a line cannot be ready before the fire arrives", () => {
    const r = suggestLines(grid, scenario, { readyMin: 500, widthM: 25 });
    expect(r.suggestions).toEqual([]);
  });
});
