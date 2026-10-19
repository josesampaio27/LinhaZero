import { describe, expect, it } from "vitest";
import { PT_CALIBRATION } from "../src/calibration";
import { listCases, loadCase, scoreCase } from "../scripts/reference";

// Real fires from PT-FireSprd (engine/test/reference, built by data-prep/build_reference.py), simulated
// from the observed ignition with the hourly ERA5 weather of those days and no suppression. The scores
// below are the mean Sørensen over each fire's observation times (deterministic runs), recorded on
// 2026-10-19 after the 32-direction stencil with sectors (ADR 0058). "legacy" is the retired simple
// model, kept in the engine only as this reference. A change that lowers one by more than TOLERANCE, or the mean, fails here: it is
// a change in how well the engine reproduces real fires and must be looked at, not waved through.
const BASELINE: Record<
  string,
  { rothermel: number; calibrated: number; legacy: number }
> = {
  Alijo_24072019: { rothermel: 0.27, calibrated: 0.49, legacy: 0.15 },
  Baiao_04092019: { rothermel: 0.1, calibrated: 0.33, legacy: 0.05 },
  CabeceirasdeBasto_06092016: { rothermel: 0.57, calibrated: 0.34, legacy: 0.28 },
  CastroDaire_07092020: { rothermel: 0.51, calibrated: 0.57, legacy: 0.39 },
  OliveiraFrades_07092020: { rothermel: 0.24, calibrated: 0.25, legacy: 0.19 },
  SaoJoaoPesqueira_10072020: { rothermel: 0.35, calibrated: 0.39, legacy: 0.2 },
  Valenca_04092019: { rothermel: 0.41, calibrated: 0.41, legacy: 0.18 },
  Valpacos_13092019: { rothermel: 0.32, calibrated: 0.37, legacy: 0.24 },
  VieiradoMinho_10082016: { rothermel: 0.59, calibrated: 0.53, legacy: 0.4 },
};
const TOLERANCE = 0.03;

describe("real fires (PT-FireSprd)", () => {
  const cases = listCases();

  it("has the nine reference fires", () => {
    expect(cases).toEqual(Object.keys(BASELINE).sort());
  });

  const scores: Record<
    string,
    { rothermel: number; calibrated: number; legacy: number }
  > = {};
  for (const fire of Object.keys(BASELINE)) {
    it(`${fire}: no worse than the recorded Sørensen`, () => {
      const c = loadCase(fire);
      const s = {
        rothermel: scoreCase(c, "rothermel").meanSorensen,
        calibrated: scoreCase(c, "rothermel", PT_CALIBRATION).meanSorensen,
        legacy: scoreCase(c, "legacy").meanSorensen,
      };
      scores[fire] = s;
      expect(s.rothermel).toBeGreaterThanOrEqual(
        BASELINE[fire].rothermel - TOLERANCE,
      );
      expect(s.calibrated).toBeGreaterThanOrEqual(
        BASELINE[fire].calibrated - TOLERANCE,
      );
      expect(s.legacy).toBeGreaterThanOrEqual(
        BASELINE[fire].legacy - TOLERANCE,
      );
    });
  }

  it("Rothermel reproduces real fires clearly better than the legacy model, on average", () => {
    const all = Object.values(scores);
    expect(all).toHaveLength(9);
    const mean = (k: "rothermel" | "calibrated" | "legacy") =>
      all.reduce((a, s) => a + s[k], 0) / all.length;
    expect(mean("rothermel")).toBeGreaterThanOrEqual(0.36);
    expect(mean("rothermel") - mean("legacy")).toBeGreaterThan(0.1);
    expect(mean("calibrated")).toBeGreaterThanOrEqual(0.39);
  });

  it("the comparison is meaningful: with every hour's wind reversed the scores drop clearly", () => {
    let real = 0,
      reversed = 0;
    for (const fire of cases) {
      const c = loadCase(fire);
      real += scoreCase(c, "rothermel").meanSorensen;
      const flipped = {
        ...c,
        weather: c.weather.map((h) => ({
          ...h,
          windFromDeg: (h.windFromDeg + 180) % 360,
        })),
      };
      reversed += scoreCase(flipped, "rothermel").meanSorensen;
    }
    expect(reversed / cases.length).toBeLessThan(real / cases.length - 0.1);
  });
});
