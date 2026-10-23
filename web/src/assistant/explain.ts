// Facts for the assistant to explain a decision with (docs/decisoes/0082): the fire an action faces, the width that
// would hold it, who wins under other winds, and percentiles over the uncertainty scenarios. Pure functions, tested in
// Node; the tools in tools.ts run the fire and put these into words.
import {
  aerialHoldProbability,
  attackEffectiveness,
  DEFAULT_PARAMS,
  flameLength,
  holdProbability,
  type GridData,
  type Metrics,
  type ModelParams,
  type Scenario,
  type Wind,
} from "@linha-zero/engine";

/** The fire that meets an action, from one run: flames of the burning cells next to (lines) or inside (zones) it. */
export interface FireFaced {
  /** Cells of the fire counted. 0 = the fire never gets there. */
  cells: number;
  maxKwM: number;
  medianKwM: number;
  maxFlameM: number;
  medianFlameM: number;
}

/**
 * The fire an action faces. For a line, the burning cells next to it outside it, which is where the engine judges
 * whether the line holds (the flames of the cell the fire would cross from); a line that holds never burns, so its
 * own cells say nothing. For a zone, its own cells.
 */
export function fireFaced(grid: GridData, cells: number[], arrivalMin: Float32Array, intensityKwM: Float32Array, durationMin: number, line: boolean): FireFaced {
  const { rows, cols } = grid.header;
  const own = new Set(cells);
  const counted = new Set<number>();
  const burning = (i: number) => arrivalMin[i] <= durationMin && intensityKwM[i] > 0;
  for (const c of cells) {
    if (!line) {
      if (burning(c)) counted.add(c);
      continue;
    }
    const r = Math.floor(c / cols);
    const col = c % cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = col + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const i = rr * cols + cc;
        if (!own.has(i) && burning(i)) counted.add(i);
      }
    }
  }
  const kw = [...counted].map((i) => intensityKwM[i]).sort((a, b) => a - b);
  if (!kw.length) return { cells: 0, maxKwM: 0, medianKwM: 0, maxFlameM: 0, medianFlameM: 0 };
  const max = kw[kw.length - 1];
  const median = kw[Math.floor(kw.length / 2)];
  return { cells: kw.length, maxKwM: max, medianKwM: median, maxFlameM: flameLength(max), medianFlameM: flameLength(median) };
}

/** Line widths the app offers (m): hand line, machine line, fuel breaks. */
export const LINE_WIDTHS_M = [1, 4, 10, 25];
/** A width "holds" when the line stops these flames at least this often. */
export const HOLD_TARGET = 0.9;

/** The narrowest width the app offers that holds flames this long with HOLD_TARGET; null when none does. */
export function widthThatHolds(flameM: number, params: ModelParams = DEFAULT_PARAMS): number | null {
  return LINE_WIDTHS_M.find((w) => holdProbability(w, flameM, params) >= HOLD_TARGET) ?? null;
}

/** Chance a line of this width holds, an aerial drop holds, or crews keep their effect, against the fire faced. */
export const lineHolds = (widthM: number, faced: FireFaced, params: ModelParams = DEFAULT_PARAMS) => holdProbability(widthM, faced.maxFlameM, params);
export const dropHolds = (faced: FireFaced, params: ModelParams = DEFAULT_PARAMS) => aerialHoldProbability(faced.maxKwM, params);
export const crewsEffect = (kwM: number, params: ModelParams = DEFAULT_PARAMS) => attackEffectiveness(kwM, params);

/** A change to the wind for a what-if: turned (degrees, clockwise) and its speed multiplied. */
export interface WindChange {
  turnDeg: number;
  speedFactor: number;
}

const changed = (w: Wind, c: WindChange): Wind => ({
  ...w,
  directionDeg: (((w.directionDeg + c.turnDeg) % 360) + 360) % 360,
  speedMs: w.speedMs * c.speedFactor,
  ...(w.gustMs !== undefined && { gustMs: w.gustMs * c.speedFactor }),
});

/** The scenario with every wind (the base one and each forecast step) changed alike. */
export function withWind(scenario: Scenario, c: WindChange): Scenario {
  return {
    ...scenario,
    wind: changed(scenario.wind, c),
    ...(scenario.weatherSteps && { weatherSteps: scenario.weatherSteps.map((s) => ({ ...s, wind: changed(s.wind, c) })) }),
  };
}

/** The what-ifs of the stress test: the forecast's usual errors in direction and speed. */
export const STRESS_CASES: { label: string; change: WindChange }[] = [
  { label: "vento rodado 20° para a esquerda", change: { turnDeg: -20, speedFactor: 1 } },
  { label: "vento rodado 20° para a direita", change: { turnDeg: 20, speedFactor: 1 } },
  { label: "vento 30% mais fraco", change: { turnDeg: 0, speedFactor: 0.7 } },
  { label: "vento 30% mais forte", change: { turnDeg: 0, speedFactor: 1.3 } },
];

export interface Verdict {
  winner: "A" | "B" | null;
  /** Buildings and hectares A minus B: positive = B does better. */
  buildings: number;
  ha: number;
}

const finalHa = (m: Metrics) => m.burnedHaByHour[m.burnedHaByHour.length - 1] ?? 0;

/**
 * Who wins one pair of runs: fewer buildings reached decides; on equal buildings, less burned area by at least 1 ha
 * (the thresholds of the result panel's headline).
 */
export function verdict(a: Metrics, b: Metrics): Verdict {
  const buildings = a.buildingsReached - b.buildingsReached;
  const ha = finalHa(a) - finalHa(b);
  const winner = buildings !== 0 ? (buildings > 0 ? "B" : "A") : Math.abs(ha) >= 1 ? (ha > 0 ? "B" : "A") : null;
  return { winner, buildings, ha };
}

/** The value below which a share `q` (0..1) of the values fall (nearest rank). */
export function percentile(values: number[], q: number): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}
