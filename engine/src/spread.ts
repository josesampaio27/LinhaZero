import { MinHeap } from "./heap";
import type { InterventionLayers } from "./interventions";
import { DEFAULT_PARAMS, type ModelParams } from "./params";
import type { SurfaceBase } from "./rothermel";
import { computeArrivalRothermel } from "./spread-rothermel";
import type { RothermelRates } from "./surface";
import type { CellRef, FireExplain, Ignition, PreparedGrid } from "./types";

// 8-neighbour offsets and the bearing (degrees clockwise from north) of each step.
// Rows grow southwards, columns eastwards.
const DR = [-1, -1, 0, 1, 1, 1, 0, -1];
const DC = [0, 1, 1, 1, 0, -1, -1, -1];
const BEARING = [0, 45, 90, 135, 180, 225, 270, 315];

export interface SpreadInput {
  ignition: CellRef;
  /** Several ignited cells, each from its own minute (e.g. an observed perimeter); replaces `ignition`. */
  ignitions?: Ignition[];
  /**
   * Cells people set alight (backfires), each from its own minute, on top of `ignitions` / `ignition`.
   * Kept apart so an ensemble run can still move the fire's own ignition point.
   */
  litIgnitions?: Ignition[];
  /** Direction the wind blows FROM, degrees clockwise from north. */
  windDirectionDeg: number;
  /** Wind speed, m/s. */
  windSpeedMs: number;
  /** Simulated time span, minutes. */
  durationMin: number;
  /** Model coefficients (legacy wind and slope; Rothermel interventions and breaches); DEFAULT_PARAMS when omitted. */
  params?: Partial<ModelParams>;
  /**
   * Ensemble run (Rothermel): breaches are drawn with hashRandom(seed, run, ...). Omitted = the
   * deterministic main run, in which a line or road holds when its hold probability is at least 50%.
   */
  random?: { seed: number; run: number };
  /** Rothermel spread rates; when present they replace the legacy formula (and its params). */
  rates?: RothermelRates;
  /** When given (Rothermel), receives each cell's fireline intensity (kW/m) as the fire arrives; 0 where it does not. */
  intensityOut?: Float32Array;
  /** When given (Rothermel), receives how the fire reached each cell (see FireExplain). */
  explainOut?: FireExplain;
  /** Fuel behaviour at the starting moisture (Rothermel); omitted = the one the rates were built with. */
  bases?: (SurfaceBase | null)[];
  /**
   * Later weather changes, in time order (the wind above holds until the first). For the Rothermel
   * model each step also carries the fuel behaviour at its moisture (from fuelBases).
   */
  changes?: SpreadChange[];
}

/** A weather change at minute fromMin. */
export interface SpreadChange {
  fromMin: number;
  windDirectionDeg: number;
  windSpeedMs: number;
  /** Fuel behaviour at this step's moisture (Rothermel only); omitted = unchanged. */
  bases?: (SurfaceBase | null)[];
}

/**
 * Computes the fire arrival time (minutes) of every cell with a Dijkstra minimum-travel-time
 * search. Cells not reached within durationMin get Infinity.
 *
 * Legacy model: 8 neighbours; the rate of a step towards neighbour j is j's legacy rate in the
 * step's direction. Rothermel model (input.rates): 16 neighbours, each step's time shared between
 * the cells it crosses (computeArrivalRothermel).
 *
 * Weather changes (input.changes) apply from their minute: a step leaving a cell at minute t uses
 * the weather at t. Dijkstra expands cells in time order, so each change happens once, when the
 * search clock passes it. If the wind strengthens, a later departure could in principle arrive
 * earlier than an earlier one; this approximation ignores that (as FARSITE's time steps do).
 *
 * Time-dependent interventions are evaluated when cell i (reached at minute t) is expanded
 * towards neighbour j: a slowdown on j applies if it is active at t (departure time), and a
 * containment line on j blocks the step if it is active at the arrival time t + cost. This is
 * an approximation: a slowdown that starts while the fire is crossing a cell is ignored for
 * that step.
 */
export function computeArrival(
  grid: PreparedGrid,
  input: SpreadInput,
  layers: InterventionLayers,
  heap: MinHeap = new MinHeap(),
): Float32Array {
  const { rows, cols, cellSize } = grid.header;
  const { baseRate, elevation } = grid;
  const { containStart, containEnd, slowFactor, slowStart, slowEnd, dropStart, dropEnd } = layers;
  const duration = input.durationMin;
  const { kWind, kSlope, minSlopeFactor } = { ...DEFAULT_PARAMS, ...input.params };
  if (input.rates) return computeArrivalRothermel(grid, input, layers, heap);
  // Float64 working copy so heap keys and stored times compare exactly.
  const arrival = new Float64Array(rows * cols).fill(Infinity);
  const result = new Float32Array(rows * cols).fill(Infinity);


  // Per-direction step length (m) and wind factor.
  const dist = new Float64Array(8);
  const windF = new Float64Array(8);
  const setLegacyWind = (fromDeg: number, speedMs: number) => {
    const windTo = fromDeg + 180;
    for (let k = 0; k < 8; k++) {
      const theta = ((windTo - BEARING[k]) * Math.PI) / 180;
      windF[k] = Math.exp(kWind * speedMs * Math.cos(theta));
    }
  };
  for (let k = 0; k < 8; k++) dist[k] = k % 2 === 0 ? cellSize : cellSize * Math.SQRT2;
  setLegacyWind(input.windDirectionDeg, input.windSpeedMs);
  const changes = input.changes ?? [];
  let next = 0; // index of the next weather change

  heap.clear();
  for (const { cell, t0Min } of [...(input.ignitions ?? [{ cell: input.ignition, t0Min: 0 }]), ...(input.litIgnitions ?? [])]) {
    const { row, col } = cell;
    if (row < 0 || col < 0 || row >= rows || col >= cols) continue;
    const i = row * cols + col;
    if (baseRate[i] <= 0 || !(t0Min >= 0) || t0Min >= arrival[i]) continue;
    arrival[i] = t0Min;
    heap.push(t0Min, i);
  }
  while (heap.size > 0) {
    const t = heap.peekKey();
    const i = heap.pop();
    if (t > arrival[i]) continue; // stale entry
    if (t > duration) break;
    while (next < changes.length && t >= changes[next].fromMin) {
      const w = changes[next++];
      setLegacyWind(w.windDirectionDeg, w.windSpeedMs);
    }
    const r = (i / cols) | 0;
    const c = i - r * cols;
    const zi = elevation[i];
    for (let k = 0; k < 8; k++) {
      const nr = r + DR[k];
      const nc = c + DC[k];
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const j = nr * cols + nc;
      const base = baseRate[j];
      if (base <= 0 || arrival[j] <= t) continue;
      const tanPhi = (elevation[j] - zi) / dist[k];
      const slopeF = Math.max(minSlopeFactor, Math.exp(kSlope * tanPhi));
      let rate = base * windF[k] * slopeF;
      if (slowStart[j] <= t && t < slowEnd[j]) rate *= slowFactor[j];
      if (rate <= 0) continue;
      const ta = t + dist[k] / rate;
      if (ta >= arrival[j] || ta > duration) continue;
      // The legacy model has no intensity: a line or an aerial drop in force always holds.
      if ((containStart[j] <= ta && ta < containEnd[j]) || (dropStart[j] <= ta && ta < dropEnd[j])) continue;
      arrival[j] = ta;
      heap.push(ta, j);
    }
  }
  result.set(arrival);
  return result;
}
