import { describe, expect, it } from "vitest";
import { arrivalError, burnedAgreement } from "../src/validation";

const I = Infinity;

describe("burned area agreement", () => {
  // 8 cells: observed burned at minutes 0, 60, 60, 120; one unknown (NaN); three unburned.
  const observed = Float32Array.from([0, 60, 60, 120, NaN, I, I, I]);

  it("counts TP/FP/FN/TN at a given minute and leaves unknown cells out", () => {
    const simulated = Float32Array.from([0, 30, 200, 90, 10, 50, I, I]);
    const a = burnedAgreement(simulated, observed, 120, 1);
    // At 120 min: observed burned = cells 0-3; simulated burned = 0, 1, 3, 5 (cell 4 is unknown).
    expect([a.tp, a.fp, a.fn, a.tn]).toEqual([3, 1, 1, 2]);
    expect(a.jaccard).toBeCloseTo(3 / 5, 12);
    expect(a.sorensen).toBeCloseTo(6 / 8, 12);
    // Kappa: po = 5/7; pe = (4·4 + 3·3) / 49 = 25/49.
    expect(a.kappa).toBeCloseTo((5 / 7 - 25 / 49) / (1 - 25 / 49), 12);
    expect([a.simulatedHa, a.observedHa]).toEqual([4, 4]);
  });

  it("is perfect for a perfect simulation", () => {
    const a = burnedAgreement(observed, observed, 120, 1);
    expect([a.jaccard, a.sorensen, a.kappa]).toEqual([1, 1, 1]);
  });
});

describe("arrival time against the observed intervals", () => {
  // Observations at 60 and 120 min: cells 1-2 burned in (0, 60], cell 3 in (60, 120].
  const observed = Float32Array.from([0, 60, 60, 120, NaN, I]);

  it("scores 0 inside the interval and the distance to it outside; counts cells never reached", () => {
    const simulated = Float32Array.from([0, 45, 80, I, 5, 5]);
    const e = arrivalError(simulated, observed, [60, 120]);
    expect(e.cells).toBe(3);
    expect(e.missed).toBe(1); // cell 3
    // Cell 1: 45 in (0, 60] → 0; cell 2: 80 vs (0, 60] → +20 (late).
    expect(e.meanAbsMin).toBeCloseTo(10, 12);
    expect(e.biasMin).toBeCloseTo(10, 12);
  });

  it("is negative when the simulation arrives too early", () => {
    const simulated = Float32Array.from([0, 30, 30, 20, 0, I]);
    const e = arrivalError(simulated, observed, [60, 120]);
    expect(e.biasMin).toBeCloseTo(-40 / 3, 12); // cell 3: 20 vs (60, 120] → −40
    expect(e.missed).toBe(0);
  });
});
