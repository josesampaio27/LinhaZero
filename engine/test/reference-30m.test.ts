import { describe, expect, it } from "vitest";
import { PT_CALIBRATION_30M } from "../src/calibration";
import { scoreIntervals, weightedCost } from "../scripts/intervals";
import { listCases, loadCase, scoreCase } from "../scripts/reference";

// Three of the 30 m fit fires closest to Guimarães (engine/test/reference-30m, ADR 0064), simulated with
// the 30 m calibration (PT_CALIBRATION_30M) and the hourly ERA5 weather, starting from the observed fire.
// Recorded on 2026-10-20:
//   sorensen  mean Sørensen over the observation times, from the ignition (higher is better);
//   cost      the calibration's interval cost, restarting from each observed front (lower is better).
// "legacy" is the retired simple model. A change that makes one worse by more than the tolerance fails
// here: it changes how well the 30 m grid reproduces real fires and must be looked at.
const DIR = new URL("./reference-30m", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const BASELINE: Record<string, { sorensen: number; cost: number; legacySorensen: number }> = {
  Baiao_04092019: { sorensen: 0.32, cost: 1.19, legacySorensen: 0.07 },
  Valenca_04092019: { sorensen: 0.39, cost: 1.31, legacySorensen: 0.19 },
  Valpacos_13092019: { sorensen: 0.37, cost: 1.15, legacySorensen: 0.24 },
};
const SORENSEN_TOLERANCE = 0.03;
const COST_TOLERANCE = 0.05;

describe("real fires at 30 m (PT-FireSprd)", () => {
  it("has the three 30 m reference fires", () => {
    expect(listCases(DIR)).toEqual(Object.keys(BASELINE).sort());
  });

  for (const [fire, base] of Object.entries(BASELINE)) {
    it(`${fire}: no worse than the recorded scores`, () => {
      const c = loadCase(fire, DIR);
      expect(c.grid.header.cellSize).toBe(30);
      const sorensen = scoreCase(c, "rothermel", PT_CALIBRATION_30M).meanSorensen;
      const cost = weightedCost(scoreIntervals(c, PT_CALIBRATION_30M));
      const legacy = scoreCase(c, "legacy").meanSorensen;
      expect(sorensen).toBeGreaterThanOrEqual(base.sorensen - SORENSEN_TOLERANCE);
      expect(cost).toBeLessThanOrEqual(base.cost + COST_TOLERANCE);
      expect(legacy).toBeGreaterThanOrEqual(base.legacySorensen - SORENSEN_TOLERANCE);
      // Rothermel beats the retired simple model on each of them.
      expect(sorensen).toBeGreaterThan(legacy);
    });
  }
});
