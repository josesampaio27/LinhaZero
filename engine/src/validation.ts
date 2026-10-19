// Scores of a simulation against an observed fire (docs/modelo/calibracao-e-validacao.md).
//
// Observed arrival rasters hold, per cell, the minute of the first observation in which the cell was
// seen burned (an upper bound on its arrival), Infinity where it did not burn and NaN where it burned
// at an unknown time; NaN cells are left out of every score.

export interface Agreement {
  /** Cells burned in both, only in the simulation, only in the observation, in neither. */
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  /** TP / (TP + FP + FN): overlap, 1 = perfect. */
  jaccard: number;
  /** 2TP / (2TP + FP + FN) (Dice, F1): overlap, more forgiving than Jaccard. */
  sorensen: number;
  /** Agreement corrected for chance over the evaluated cells (depends on the size of the domain). */
  kappa: number;
  simulatedHa: number;
  observedHa: number;
}

/** Burned area agreement at minute atMin: simulated arrival <= atMin against observed arrival <= atMin. */
export function burnedAgreement(
  simulated: Float32Array,
  observed: Float32Array,
  atMin: number,
  cellHa: number,
): Agreement {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  for (let i = 0; i < observed.length; i++) {
    const o = observed[i];
    if (Number.isNaN(o)) continue;
    const s = simulated[i] <= atMin;
    const b = o <= atMin;
    if (s && b) tp++;
    else if (s) fp++;
    else if (b) fn++;
    else tn++;
  }
  const n = tp + fp + fn + tn;
  const po = n ? (tp + tn) / n : 1;
  const pe = n ? ((tp + fp) * (tp + fn) + (fn + tn) * (fp + tn)) / (n * n) : 0;
  return {
    tp,
    fp,
    fn,
    tn,
    jaccard: tp + fp + fn ? tp / (tp + fp + fn) : 1,
    sorensen: 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : 1,
    kappa: pe < 1 ? (po - pe) / (1 - pe) : 1,
    simulatedHa: (tp + fp) * cellHa,
    observedHa: (tp + fn) * cellHa,
  };
}

export interface ArrivalError {
  /** Cells observed burning after the ignition with a known interval. */
  cells: number;
  /** Of those, how many the simulation never reaches within the last observation. */
  missed: number;
  /** Mean and median distance (minutes) from the simulated arrival to the observed interval; 0 inside it. Reached cells only. */
  meanAbsMin: number;
  medianAbsMin: number;
  /** Mean signed distance: negative = the simulation arrives too early, positive = too late. */
  biasMin: number;
}

/**
 * Arrival time against the observation intervals (Filippi et al. 2014 argue overlap scores miss the
 * dynamics). A cell first seen burned at observation k burned between observations k-1 and k; a
 * simulated arrival inside that interval scores 0, otherwise the distance to it. observationMinutes
 * are the observation times after the ignition (minute 0), in increasing order.
 */
export function arrivalError(
  simulated: Float32Array,
  observed: Float32Array,
  observationMinutes: number[],
): ArrivalError {
  const times = [0, ...observationMinutes];
  const last = times[times.length - 1];
  const errors: number[] = [];
  let cells = 0,
    missed = 0,
    bias = 0;
  for (let i = 0; i < observed.length; i++) {
    const o = observed[i];
    if (!(o > 0 && o <= last)) continue; // ignition cells, unburned and unknown left out
    let k = times.findIndex((t) => t >= o - 1e-6);
    if (k <= 0) k = 1;
    const lo = times[k - 1],
      hi = times[k];
    cells++;
    const s = simulated[i];
    if (!(s <= last)) {
      missed++;
      continue;
    }
    const e = s < lo ? s - lo : s > hi ? s - hi : 0;
    errors.push(Math.abs(e));
    bias += e;
  }
  errors.sort((a, b) => a - b);
  const n = errors.length;
  return {
    cells,
    missed,
    meanAbsMin: n ? errors.reduce((a, b) => a + b, 0) / n : NaN,
    medianAbsMin: n ? (errors[(n - 1) >> 1] + errors[n >> 1]) / 2 : NaN,
    biasMin: n ? bias / n : NaN,
  };
}
