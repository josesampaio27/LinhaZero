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

/** The fires PT_CALIBRATION was fitted on (ADR 0053): not held out for it. */
export const PT_CALIBRATION_SEEN: readonly string[] = [
  "Alijo_24072019",
  "Baiao_04092019",
  "CastroDaire_07092020",
  "OliveiraFrades_07092020",
  "SaoJoaoPesqueira_10072020",
  "Valenca_04092019",
  "Valpacos_13092019",
];

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
export const BURN_CHANCE_ENSEMBLE: BurnChanceEnsemble = {
  windDirJitterDeg: 30,
  windSpeedJitterPct: 37.5,
  perturb: { deadMoisturePts: 0.04, fuelLogSd: 0.6, ignitionRadiusM: 400 },
};

export interface BurnChanceEnsemble {
  windDirJitterDeg: number;
  windSpeedJitterPct: number;
  perturb: EnsemblePerturbation;
}

/**
 * Calibration of the 30 m grid (ADR 0062): for now the same values as the 100 m grid, kept on 30 m
 * evidence. A standalone 30 m fit from the physical values, on the 19 PT-FireSprd fires rebuilt at 30 m
 * that make sense for the engine (engine/reports/selection-30m.json), did not beat the physical model by
 * the pre-registered rule (report pt-firesprd-30m-2026-10-20-base.json). These values, never fitted on
 * the 30 m cases, beat both on the 13 fires they never saw: Sørensen from the ignition 0.332 → 0.398
 * against the physical model (paired +0.061, 90% +0.016 to +0.113), interval cost −0.021. A 30 m refit
 * whose objective also rewards the Sørensen from the ignition is planned (docs/plano-refit-30m.md).
 */
export const PT_CALIBRATION_30M: Readonly<Partial<ModelParams>> = PT_CALIBRATION;
export const PT_CALIBRATION_30M_ID = "pt-firesprd-2026-10-copas-limite@30m";
/** Ensemble of the 30 m grid, checked on the same fires (reliability.ts). */
export const BURN_CHANCE_ENSEMBLE_30M: BurnChanceEnsemble = BURN_CHANCE_ENSEMBLE;

/** Grids with cells up to this size (m) use the 30 m calibration; coarser ones the 100 m one. */
export const FINE_GRID_MAX_CELL_M = 50;

export interface GridCalibration {
  id: string;
  params: Readonly<Partial<ModelParams>>;
  samples: readonly Partial<ModelParams>[];
  ensemble: BurnChanceEnsemble;
}

/** The calibration of a grid with this cell size: each resolution has its own (ADRs 0053-0058 and 0062). */
export function calibrationFor(cellSize: number): GridCalibration {
  return cellSize <= FINE_GRID_MAX_CELL_M
    ? { id: PT_CALIBRATION_30M_ID, params: PT_CALIBRATION_30M, samples: [], ensemble: BURN_CHANCE_ENSEMBLE_30M }
    : { id: PT_CALIBRATION_ID, params: PT_CALIBRATION, samples: PT_CALIBRATION_SAMPLES, ensemble: BURN_CHANCE_ENSEMBLE };
}
