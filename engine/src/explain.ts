// Why the fire reaches a cell when it does: the path it took from the ignition, and what made it fast along
// that path, from the record of the main run (Scenario.explain, SimulationResult.explain). No new simulation.
import { EXPLAIN_CROWN, EXPLAIN_SLOWED, type FireExplain, type GridData } from "./types";

/** The cells the fire went through to reach `cell`, from the ignition (first) to `cell` (last); [] if not reached. */
export function firePath(explain: FireExplain, arrivalMin: Float32Array, cell: number): number[] {
  if (!(cell >= 0 && cell < arrivalMin.length) || !Number.isFinite(arrivalMin[cell])) return [];
  const path = [cell];
  // Each step goes back to a cell reached earlier, so the walk ends; the cap guards against a bad record.
  for (let x = explain.from[cell], k = 0; x >= 0 && k < arrivalMin.length; x = explain.from[x], k++) path.push(x);
  return path.reverse();
}

export interface PathExplanation {
  /** The path, ignition first. */
  cells: number[];
  /** Minute the fire starts on the first cell of the path, and reaches the last one. */
  startMin: number;
  arrivalMin: number;
  /** Length of the path (m) and the mean rate along it (m/min). */
  lengthM: number;
  meanRateMMin: number;
  /**
   * What made the fire fast, weighted by the time spent on each step: the head rate is
   * r0 × (1 + wind + slope), so fuel = 1 / (1 + wind + slope) and so on; they add up to 1. A negative slope
   * share means the fire ran downhill, against the slope. Crown fire steps are left out (crownShare).
   */
  shares: { fuel: number; wind: number; slope: number };
  /** Share of the time spent in crown fire, near the head of the fire (rate ≥ 80% of the head rate), and slowed by an action. */
  crownShare: number;
  headShare: number;
  slowedShare: number;
  /** Fuel codes along the path, by share of the time, largest first. */
  fuels: { code: number; share: number }[];
}

/** Explains the arrival at `cell` (see PathExplanation); null if the fire does not reach it or starts there. */
export function explainPath(grid: GridData, explain: FireExplain, arrivalMin: Float32Array, cell: number): PathExplanation | null {
  const cells = firePath(explain, arrivalMin, cell);
  if (cells.length < 2) return null;
  const { cols, cellSize } = grid.header;
  let lengthM = 0;
  let total = 0;
  let fuel = 0,
    wind = 0,
    slope = 0,
    split = 0;
  let crown = 0,
    head = 0,
    slowed = 0;
  const byFuel = new Map<number, number>();
  for (let k = 1; k < cells.length; k++) {
    const i = cells[k - 1];
    const j = cells[k];
    const dr = Math.floor(j / cols) - Math.floor(i / cols);
    const dc = (j % cols) - (i % cols);
    lengthM += Math.hypot(dr, dc) * cellSize;
    const dt = arrivalMin[j] - arrivalMin[i];
    if (!(dt > 0)) continue;
    total += dt;
    byFuel.set(grid.fuel[j], (byFuel.get(grid.fuel[j]) ?? 0) + dt);
    const flags = explain.flags[j];
    if (flags & EXPLAIN_SLOWED) slowed += dt;
    if (explain.headRate[j] > 0 && explain.rate[j] >= 0.8 * explain.headRate[j]) head += dt;
    if (flags & EXPLAIN_CROWN) {
      crown += dt;
      continue;
    }
    const sum = 1 + explain.windPart[j] + explain.slopePart[j];
    if (!(sum > 0)) continue;
    fuel += dt / sum;
    wind += (dt * explain.windPart[j]) / sum;
    slope += (dt * explain.slopePart[j]) / sum;
    split += dt;
  }
  const startMin = arrivalMin[cells[0]];
  const span = arrivalMin[cell] - startMin;
  const of = (x: number, over: number) => (over > 0 ? x / over : 0);
  return {
    cells,
    startMin,
    arrivalMin: arrivalMin[cell],
    lengthM,
    meanRateMMin: of(lengthM, span),
    shares: { fuel: of(fuel, split), wind: of(wind, split), slope: of(slope, split) },
    crownShare: of(crown, total),
    headShare: of(head, total),
    slowedShare: of(slowed, total),
    fuels: [...byFuel]
      .map(([code, t]) => ({ code, share: of(t, total) }))
      .sort((a, b) => b.share - a.share),
  };
}
