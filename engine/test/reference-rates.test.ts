import { describe, expect, it } from "vitest";
import { ANDERSON_13 } from "../src/fuel-models";
import { DEFAULT_PARAMS } from "../src/params";
import { DEFAULT_MOISTURE } from "../src/rothermel";
import { referenceHeadRates } from "../src/surface";
import { makeGrid } from "./helpers";

const p = { rosAdj: 1, windAdj: 1, crownRatio: DEFAULT_PARAMS.crownRatio };

describe("reference head rates (what the map shows)", () => {
  it("are 0 on barriers and fuels that do not burn, and grow with the reference wind", () => {
    const g = makeGrid({ rows: 3, cols: 3, rothermel: ANDERSON_13[1], barrier: (r, c) => r === 0 && c === 0 });
    g.fuel[8] = 0; // "Não combustível"
    const calm = referenceHeadRates(g, p, DEFAULT_MOISTURE, 0);
    const windy = referenceHeadRates(g, p, DEFAULT_MOISTURE, 20);
    expect(calm[0]).toBe(0);
    expect(calm[8]).toBe(0);
    expect(calm[4]).toBeGreaterThan(0);
    expect(windy[4]).toBeGreaterThan(calm[4] * 2);
  });

  it("follow the calibration in use", () => {
    const g = makeGrid({ rows: 1, cols: 1, rothermel: ANDERSON_13[1] });
    const plain = referenceHeadRates(g, p)[0];
    expect(referenceHeadRates(g, { ...p, rosAdj: 0.5 })[0]).toBeCloseTo(plain * 0.5, 6);
  });

  it("are slower under trees for a fuel the canopy shelters", () => {
    const sheltered = { ...ANDERSON_13[8], underCanopy: true };
    const open = referenceHeadRates(makeGrid({ rows: 1, cols: 1, rothermel: sheltered, canopy: () => 0 }), p)[0];
    const forest = referenceHeadRates(makeGrid({ rows: 1, cols: 1, rothermel: sheltered, canopy: () => 80 }), p)[0];
    expect(forest).toBeLessThan(open);
  });
});
