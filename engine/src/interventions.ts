import type { Intervention } from "./types";

/**
 * Per-cell rasters of the interventions of a scenario, in minutes and dimensionless factors. Every
 * action works from its start minute (inclusive) to its end minute (exclusive); Infinity = never / no end.
 */
export interface InterventionLayers {
  /** Minute from which the cell can no longer burn (containment line, backfire control line); Infinity = never. */
  containStart: Float32Array;
  /** Minute from which that line is no longer held and the fire crosses it; Infinity = never. */
  containEnd: Float32Array;
  /** Width (m) of the containment line on the cell (the widest where lines overlap); NaN = the default width. */
  containWidth: Float32Array;
  /** Rate multiplier from suppression / protected zones (1 = none). */
  slowFactor: Float32Array;
  /** Minute from which slowFactor applies; Infinity = never. */
  slowStart: Float32Array;
  /** Minute from which slowFactor no longer applies; Infinity = never. */
  slowEnd: Float32Array;
  /** Minute from which an aerial drop holds the fire on the cell (if not too intense); Infinity = never. */
  dropStart: Float32Array;
  /** Minute from which that drop no longer acts; Infinity = never. */
  dropEnd: Float32Array;
}

/** The end minute of an intervention: Infinity when it has none. */
const endOf = (iv: Intervention) => (iv.endMin !== undefined && Number.isFinite(iv.endMin) ? iv.endMin : Infinity);

/**
 * Burns the interventions into per-cell rasters. Where several overlap on one cell (ADRs 0004 and 0070):
 * - lines (containment lines and backfire control lines) hold from the earliest start to the latest end;
 * - the strongest slowdown (lowest factor) wins, with its own start and end;
 * - aerial drops act from the earliest start to the latest end.
 * Throws on an unknown kind rather than guessing what it does.
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
  const containEnd = new Float32Array(n).fill(Infinity);
  const containWidth = new Float32Array(n).fill(NaN);
  const slowFactor = new Float32Array(n).fill(background ? Math.max(0, background.factor) : 1);
  const slowStart = new Float32Array(n).fill(background ? background.startMin : Infinity);
  const slowEnd = new Float32Array(n).fill(Infinity);
  const dropStart = new Float32Array(n).fill(Infinity);
  const dropEnd = new Float32Array(n).fill(Infinity);
  // Lines and drops: the latest end among those on each cell (-Infinity until one is seen).
  const lineEnd = new Float64Array(n).fill(-Infinity);
  const dropLatest = new Float64Array(n).fill(-Infinity);
  for (const iv of interventions) {
    const end = endOf(iv);
    for (const { row, col } of iv.cells) {
      if (row < 0 || col < 0 || row >= rows || col >= cols) continue;
      const i = row * cols + col;
      switch (iv.kind) {
        case "containmentLine":
        case "backfire":
          containStart[i] = Math.min(containStart[i], iv.startMin);
          lineEnd[i] = Math.max(lineEnd[i], end);
          if (iv.widthM !== undefined && !(containWidth[i] >= iv.widthM)) containWidth[i] = iv.widthM;
          break;
        case "suppression":
        case "protectZone": {
          const factor = Math.max(0, iv.rateFactor);
          if (factor < slowFactor[i] || (factor === slowFactor[i] && iv.startMin < slowStart[i])) {
            slowFactor[i] = factor;
            slowStart[i] = iv.startMin;
            slowEnd[i] = end;
          }
          break;
        }
        case "aerialDrop":
          dropStart[i] = Math.min(dropStart[i], iv.startMin);
          dropLatest[i] = Math.max(dropLatest[i], end);
          break;
        default: {
          const unknown: never = iv;
          throw new Error(`Tipo de intervenção desconhecido: ${String((unknown as { kind?: unknown }).kind)}`);
        }
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (lineEnd[i] > -Infinity) containEnd[i] = lineEnd[i];
    if (dropLatest[i] > -Infinity) dropEnd[i] = dropLatest[i];
  }
  return { containStart, containEnd, containWidth, slowFactor, slowStart, slowEnd, dropStart, dropEnd };
}

/** Whether an action that works from `start` to `end` (exclusive) is in force at minute t. */
export const activeAt = (start: number, end: number, t: number) => start <= t && t < end;
