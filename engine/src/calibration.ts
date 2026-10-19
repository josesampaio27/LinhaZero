// Calibration of the Rothermel model on real Portuguese fires (PT-FireSprd; engine/scripts/calibrate.ts,
// docs/modelo/calibracao-e-validacao.md). It absorbs what the simulations lack (local winds stronger
// than the reanalysis, fuels that differ from their model); the engine defaults in params.ts stay
// physical. Applied by buildScenario and the engine worker for the Rothermel model.
import type { ModelParams } from "./params";
import type { EnsemblePerturbation } from "./types";

/**
 * rosAdj, windAdj and holdWidthPerFlame: fitted on 7 fires of 2019-2020 by mean Sørensen from the
 * ignition (ADR 0053) and confirmed on 26 more (ADR 0054). It also absorbs firefighting.
 * Crown fire (ADR 0056): on, at 0.35 × Cruz et al.'s rate, chosen by 5-fold cross-validation on the 32
 * tier A fires (held out: Sørensen 0.390 → 0.395, interval cost 1.150 → 1.148).
 * Wind limit: Rothermel's original. The revised limit of Andrews et al. (2013) is stricter, not looser,
 * for almost every Guimarães fuel (ADR 0058).
 */
export const PT_CALIBRATION: Readonly<Partial<ModelParams>> = {
  rosAdj: 0.5,
  windAdj: 2.5,
  holdWidthPerFlame: 5,
  crownFire: 1,
  crownAdj: 0.35,
};
export const PT_CALIBRATION_ID = "pt-firesprd-2026-10-copas-limite";

/** Parameter sets the ensemble draws (run k uses sample k mod n): the calibration's uncertainty. Empty = none. */
export const PT_CALIBRATION_SAMPLES: readonly Partial<ModelParams>[] = [];

/**
 * The Rothermel ensemble checked against real fires (engine/scripts/reliability.ts, report
 * reliability-2026-10-19.json, ADRs 0055 and 0057): wind jitter and per-run perturbations of dead fuel
 * moisture, fuel speed and ignition point, chosen by Brier score on held-out PT-FireSprd fires within
 * physically plausible ranges, judged where the real fire was least held (free-running intervals and
 * the first observation). The share of runs that burn a cell is shown as is: the probability of burning
 * with no firefighting other than what the user draws.
 */
export const BURN_CHANCE_ENSEMBLE: { windDirJitterDeg: number; windSpeedJitterPct: number; perturb: EnsemblePerturbation } = {
  windDirJitterDeg: 30,
  windSpeedJitterPct: 37.5,
  perturb: { deadMoisturePts: 0.04, fuelLogSd: 0.6, ignitionRadiusM: 400 },
};
