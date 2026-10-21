import type { Intervention } from "./types";

/** Per-cell rasters of the interventions of a scenario, in minutes and dimensionless factors. */
export interface InterventionLayers {
  /** Minute from which the cell can no longer burn (containment line); Infinity = never. */
  containStart: Float32Array;
  /** Width (m) of the containment line on the cell (the widest where lines overlap); NaN = the default width. */
  containWidth: Float32Array;
  /** Rate multiplier from suppression / protected zones (1 = none). */
  slowFactor: Float32Array;
  /** Minute from which slowFactor applies; Infinity = never. */
  slowStart: Float32Array;
}

/**
 * Burns the interventions into per-cell rasters. Where several overlap on one cell, the
 * earliest containment wins, and the strongest slowdown (lowest factor) wins with its own start.
 */
export function buildInterventionLayers(
  interventions: Intervention[],
  rows: number,
  cols: number,
  /** A slowdown of every cell (calibration only, ModelParams.bgSuppression); drawn zones still win where stronger. */
  background?: { factor: number; startMin: number },
): InterventionLayers {
  const n = rows * cols;
  const containStart = new Float32Array(n).fill(Infinity);
  const containWidth = new Float32Array(n).fill(NaN);
  const slowFactor = new Float32Array(n).fill(background ? Math.max(0, background.factor) : 1);
  const slowStart = new Float32Array(n).fill(background ? background.startMin : Infinity);
  for (const iv of interventions) {
    for (const { row, col } of iv.cells) {
      if (row < 0 || col < 0 || row >= rows || col >= cols) continue;
      const i = row * cols + col;
      if (iv.kind === "containmentLine") {
        containStart[i] = Math.min(containStart[i], iv.startMin);
        if (iv.widthM !== undefined && !(containWidth[i] >= iv.widthM)) containWidth[i] = iv.widthM;
      } else {
        const factor = Math.max(0, iv.rateFactor);
        if (factor < slowFactor[i] || (factor === slowFactor[i] && iv.startMin < slowStart[i])) {
          slowFactor[i] = factor;
          slowStart[i] = iv.startMin;
        }
      }
    }
  }
  return { containStart, containWidth, slowFactor, slowStart };
}
