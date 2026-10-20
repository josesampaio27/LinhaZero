import { describe, expect, it } from "vitest";
import { PT_CALIBRATION } from "../src/calibration";
import { listCases, loadCase, scoreCase } from "../scripts/reference";

// Real fires from PT-FireSprd (engine/test/reference, built by data-prep/build_reference.py), simulated
// from the observed ignition with the hourly ERA5 weather of those days and no suppression. The scores
// below are the mean Sørensen over each fire's observation times (deterministic runs), recorded on
// 2026-10-20 after ADR 0061 (steps recomputed when the weather changes, the fire starting from the observed
// ignition zone), with the 100 m calibration (PT_CALIBRATION). "legacy" is the retired simple
// model, kept in the engine only as this reference. A change that lowers one by more than TOLERANCE, or the mean, fails here: it is
// a change in how well the engine reproduces real fires and must be looked at, not waved through.
const BASELINE: Record<
  string,
  { rothermel: number; calibrated: number; legacy: number }
> = {
  Alijo_24072019: { rothermel: 0.29, calibrated: 0.52, legacy: 0.17 },
  Baiao_04092019: { rothermel: 0.12, calibrated: 0.32, legacy: 0.06 },
  CabeceirasdeBasto_06092016: { rothermel: 0.47, calibrated: 0.52, legacy: 0.26 },
  CastroDaire_07092020: { rothermel: 0.48, calibrated: 0.51, legacy: 0.4 },
  OliveiraFrades_07092020: { rothermel: 0.36, calibrated: 0.36, legacy: 0.22 },
  SaoJoaoPesqueira_10072020: { rothermel: 0.36, calibrated: 0.41, legacy: 0.21 },
  Valenca_04092019: { rothermel: 0.44, calibrated: 0.4, legacy: 0.2 },
  Valpacos_13092019: { rothermel: 0.34, calibrated: 0.39, legacy: 0.25 },
  VieiradoMinho_10082016: { rothermel: 0.6, calibrated: 0.53, legacy: 0.41 },
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
