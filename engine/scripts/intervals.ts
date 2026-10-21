// Interval scoring of a real fire (docs/modelo/calibracao-e-validacao.md).
//
// Scored from the ignition, an early error in a fire spoils every later observation. Here each interval
// between two observations is simulated on its own: the fire restarts from the area observed burned at
// the start of the interval, with that interval's weather, and only the cells that burned *during* the
// interval are compared. Errors in rate and direction are measured where they happen, as in data
// assimilation, instead of compounding.
import type { ModelParams } from "../src/params";
import { simulate } from "../src/simulate";
import type { EnsembleOptions, Ignition, PreparedGrid, Scenario, SpreadModel, WeatherStep } from "../src/types";
import {
  scenarioOf,
  weatherStepsOf,
  type MoistureModel,
  type ReferenceCase,
  type WeatherSource,
} from "./reference";

export interface IntervalOptions {
  spreadModel?: SpreadModel;
  /** Random realisation (breaches and spot fires drawn); omitted = deterministic. */
  run?: number;
  seed?: number;
  weather?: WeatherSource;
  moisture?: MoistureModel;
  /**
   * Intervals whose observed new area is below this (ha) are skipped: small growth is mostly mapping
   * error. In hectares, so the same intervals are scored at any cell size.
   */
  minNewHa?: number;
  /** Weight of an interval that is not free-running (slow, late or held by firefighting). */
  slowWeight?: number;
  /**
   * Free-running fire only (slowWeight 0): the engine simulates an unfought fire, so its physics is
   * judged where the real fire was not being held (docs/decisoes/0057).
   */
  freeOnly?: boolean;
}

export interface IntervalScore {
  fire: string;
  startMin: number;
  endMin: number;
  observedNew: number;
  simulatedNew: number;
  /** Sørensen of the cells that burned during the interval (simulated against observed). */
  sorensen: number;
  /**
   * |log(simulated / observed new area)|, with one hectare added to both (so the same at any cell size), capped at ln 5: a factor of 5 is
   * already wholly wrong, and the cap keeps one runaway night or held interval from dominating a fire.
   */
  growthError: number;
  /** 90th-percentile distance (m) of new cells from the area burned at the start, per minute. */
  observedRateMMin: number;
  simulatedRateMMin: number;
  /** PT-FireSprd L2 spread rate of the matching interval (m/min), when there is one. */
  l2RateMMin: number | null;
  /** True when the fire was spreading freely (fast growth): such intervals weigh 1, the others slowWeight. */
  freeRunning: boolean;
  weight: number;
  /** New cells burned in both, only in the simulation, only in the observation. */
  tp: number;
  fp: number;
  fn: number;
  /** Of fp, the cells beyond a held flank (heldFlankZone): not counted by the coverage score. */
  fpHeld: number;
  /** A fast run the firefighters could not hold (COVERAGE.anchor): its head speed is scored. */
  anchor: boolean;
}

export const MAX_GROWTH_ERROR = Math.log(5);

/**
 * The coverage score (ADR 0068). The engine simulates fire with no firefighting and the observed fires
 * were fought, so burning less than the real fire is wrong, while burning more is expected where crews
 * held it: misses weigh more than extra burn, extra burn costs only beyond a plausible share and only
 * while the fire ran freely, and the head speed of fast runs no crew could hold anchors the rate.
 * Fixed before scoring any model with it.
 */
export const COVERAGE = {
  /** Tversky weights of extra burn (fp) and misses (fn): misses cost 4 times as much. */
  alpha: 0.2,
  beta: 0.8,
  /** Weight of the area terms, as the growth error of the interval cost. */
  areaWeight: 0.5,
  /** Extra burn beyond this ratio of the observed new area costs (free-running intervals only). */
  overRatio: 3,
  /** Fast runs: a PT-FireSprd rate above this (m/min) with a quality flag of at least anchorMinQc. */
  anchorMinRateMMin: 15,
  anchorMinQc: 3,
  /** Weight of the head-speed error |ln(simulated / observed rate)| of the fast runs, per fire. */
  anchorWeight: 0.5,
  /** A burning edge with no observed growth within this distance (m) during the interval was held. */
  heldRadiusM: 150,
} as const;

/** Tversky index: tp / (tp + α·fp + β·fn); with α = β = ½ it is the Sørensen index. */
export const tversky = (tp: number, fp: number, fn: number, alpha: number = COVERAGE.alpha, beta: number = COVERAGE.beta) =>
  tp + alpha * fp + beta * fn > 0 ? tp / (tp + alpha * fp + beta * fn) : 1;

/**
 * Coverage cost of an interval (0 = perfect): 1 − Tversky of the new cells, plus the area missed and,
 * in a free-running interval, the extra area beyond COVERAGE.overRatio, each as a capped log ratio
 * with one hectare added to both sides. Extra burn beyond a held flank is not counted.
 */
export function coverageCost(s: IntervalScore, cellHa: number): number {
  const fp = s.fp - s.fpHeld;
  const obs = s.tp + s.fn + 1 / cellHa;
  const sim = s.tp + fp + 1 / cellHa;
  const miss = Math.min(MAX_GROWTH_ERROR, Math.max(0, Math.log(obs / sim)));
  const over = s.freeRunning ? Math.min(MAX_GROWTH_ERROR, Math.max(0, Math.log(sim / obs) - Math.log(COVERAGE.overRatio))) : 0;
  return 1 - tversky(s.tp, fp, s.fn) + COVERAGE.areaWeight * (miss + over);
}

/** Head-speed error of a fast run: |ln(simulated / observed rate)|, capped at ln 5. */
export const anchorError = (s: IntervalScore) =>
  Math.min(MAX_GROWTH_ERROR, Math.abs(Math.log(Math.max(s.simulatedRateMMin, 1e-6) / s.observedRateMMin)));

/** A fire's coverage cost: the weighted mean over its intervals plus the head-speed error of its fast runs. */
export function weightedCoverageCost(scores: IntervalScore[], cellHa: number): number {
  let w = 0,
    sum = 0;
  for (const s of scores) {
    w += s.weight;
    sum += s.weight * coverageCost(s, cellHa);
  }
  if (!w) return NaN;
  const fast = scores.filter((s) => s.anchor);
  const anchor = fast.length ? fast.reduce((a, s) => a + anchorError(s), 0) / fast.length : 0;
  return sum / w + COVERAGE.anchorWeight * anchor;
}

/** Interval cost: (1 − Sørensen of the new cells) + 0.5 × growth error. 0 = perfect. */
export const intervalCost = (s: IntervalScore) =>
  1 - s.sorensen + 0.5 * s.growthError;

/** Weighted mean of intervalCost over a set of scored intervals. */
export function weightedCost(scores: IntervalScore[]): number {
  let w = 0,
    sum = 0;
  for (const s of scores) {
    w += s.weight;
    sum += s.weight * intervalCost(s);
  }
  return w ? sum / w : NaN;
}

/** From the ignition, over the observation times: mean Tversky (COVERAGE weights) and mean share of the observed burned area also burned (recall). */
export function fromIgnitionCoverage(at: { tp: number; fp: number; fn: number }[]): { tversky: number; recall: number } {
  const mean = (f: (a: { tp: number; fp: number; fn: number }) => number) => at.reduce((s, a) => s + f(a), 0) / at.length;
  return { tversky: mean((a) => tversky(a.tp, a.fp, a.fn)), recall: mean((a) => (a.tp + a.fn ? a.tp / (a.tp + a.fn) : 1)) };
}

/** Chamfer distance (cells, weights 1 and √2) from every cell to the nearest `source` cell. */
export function distanceFrom(
  source: Uint8Array,
  rows: number,
  cols: number,
): Float32Array {
  const d = new Float32Array(rows * cols).fill(Infinity);
  for (let i = 0; i < d.length; i++) if (source[i]) d[i] = 0;
  const D = Math.SQRT2;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      let v = d[i];
      if (c > 0) v = Math.min(v, d[i - 1] + 1);
      if (r > 0) {
        v = Math.min(v, d[i - cols] + 1);
        if (c > 0) v = Math.min(v, d[i - cols - 1] + D);
        if (c < cols - 1) v = Math.min(v, d[i - cols + 1] + D);
      }
      d[i] = v;
    }
  for (let r = rows - 1; r >= 0; r--)
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      let v = d[i];
      if (c < cols - 1) v = Math.min(v, d[i + 1] + 1);
      if (r < rows - 1) {
        v = Math.min(v, d[i + cols] + 1);
        if (c < cols - 1) v = Math.min(v, d[i + cols + 1] + D);
        if (c > 0) v = Math.min(v, d[i + cols - 1] + D);
      }
      d[i] = v;
    }
  return d;
}

function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

/** The start of each scored interval: the ignition (0) and every observation but the last. */
export function intervalBounds(c: ReferenceCase): [number, number][] {
  const t = [0, ...c.observationMinutes];
  return t.slice(1).map((end, k) => [t[k], end]);
}

/** What an interval restart needs that does not depend on the parameters (cached per case). */
interface IntervalSetup {
  ignitions: Ignition[];
  burnedAtStart: Uint8Array;
  grid: PreparedGrid;
  weatherSteps: WeatherStep[];
  durationMin: number;
  /** Chamfer distance (cells) from the area burned at the start, computed on first use. */
  dist?: Float32Array;
  /** heldFlankZone, computed on first use (null: no held flank). */
  held?: Uint8Array | null;
}
// Per case (one per worker thread): calibration scores the same intervals thousands of times with
// different parameters, and rebuilding the restart (spent fuel, weather, distances) was a large part of it.
const setupCache = new WeakMap<ReferenceCase, Map<string, IntervalSetup>>();

/** The scenario that restarts the fire at `startMin` from the area observed burned by then. */
export function intervalScenario(
  c: ReferenceCase,
  startMin: number,
  endMin: number,
  spreadModel: SpreadModel,
  params?: Partial<ModelParams>,
  weather: WeatherSource = "era5",
  moisture: MoistureModel = "nfdrs",
): { scenario: Scenario; burnedAtStart: Uint8Array; grid: PreparedGrid } {
  const s = intervalSetup(c, startMin, endMin, weather, moisture);
  return {
    scenario: {
      ignition: s.ignitions[0].cell,
      ignitions: s.ignitions,
      wind: s.weatherSteps[0].wind,
      weatherSteps: s.weatherSteps,
      durationMin: s.durationMin,
      interventions: [],
      spreadModel,
      params,
    },
    burnedAtStart: s.burnedAtStart,
    grid: s.grid,
  };
}

const newCellsCache = new WeakMap<ReferenceCase, number[]>();
/** Cells observed to burn during each interval (intervalBounds), cached per case. */
export function observedNewCells(c: ReferenceCase): number[] {
  let k = newCellsCache.get(c);
  if (!k) {
    k = intervalBounds(c).map(([a, b]) => {
      let m = 0;
      for (let i = 0; i < c.observed.length; i++) if (c.observed[i] > a && c.observed[i] <= b) m++;
      return m;
    });
    newCellsCache.set(c, k);
  }
  return k;
}

/** Distance (cells) of every cell from the area burned at the start of the interval (cached). */
function startDistance(c: ReferenceCase, startMin: number, endMin: number, weather: WeatherSource, moisture: MoistureModel): Float32Array {
  const s = intervalSetup(c, startMin, endMin, weather, moisture);
  return (s.dist ??= distanceFrom(s.burnedAtStart, c.grid.header.rows, c.grid.header.cols));
}

/**
 * Cells beyond a held flank during an interval, from the observation alone (ADR 0068): the burning
 * edge the fire restarts from (the cells observed burning by the start that are not spent) is held
 * where no cell observed burning during the interval lies within COVERAGE.heldRadiusM of it. A cell
 * closer to a held part of the edge than to an active one is in the zone: the engine has no
 * firefighting, so its spread there is not an error. Null when no part of the edge was held.
 */
export function heldFlankZone(c: ReferenceCase, startMin: number, endMin: number, weather: WeatherSource = "era5", moisture: MoistureModel = "nfdrs"): Uint8Array | null {
  const s = intervalSetup(c, startMin, endMin, weather, moisture);
  if (s.held !== undefined) return s.held;
  const { rows, cols, cellSize } = c.grid.header;
  const n = rows * cols;
  const grown = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (c.observed[i] > startMin && c.observed[i] <= endMin) grown[i] = 1;
  const toGrowth = distanceFrom(grown, rows, cols);
  const radius = COVERAGE.heldRadiusM / cellSize;
  const held = new Uint8Array(n);
  const active = new Uint8Array(n);
  let anyHeld = false;
  for (const { cell } of s.ignitions) {
    const i = cell.row * cols + cell.col;
    if (toGrowth[i] > radius) {
      held[i] = 1;
      anyHeld = true;
    } else active[i] = 1;
  }
  if (!anyHeld) return (s.held = null);
  const toHeld = distanceFrom(held, rows, cols);
  const toActive = distanceFrom(active, rows, cols);
  const zone = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (toHeld[i] < toActive[i]) zone[i] = 1;
  return (s.held = zone);
}

function intervalSetup(c: ReferenceCase, startMin: number, endMin: number, weather: WeatherSource, moisture: MoistureModel): IntervalSetup {
  let byCase = setupCache.get(c);
  if (!byCase) setupCache.set(c, (byCase = new Map()));
  const key = `${startMin}|${endMin}|${weather}|${moisture}`;
  let s = byCase.get(key);
  if (!s) byCase.set(key, (s = buildIntervalSetup(c, startMin, endMin, weather, moisture)));
  return s;
}

function buildIntervalSetup(c: ReferenceCase, startMin: number, endMin: number, weather: WeatherSource, moisture: MoistureModel): IntervalSetup {
  const { header } = c.grid;
  const base = scenarioOf(c, "rothermel");
  const n = header.rows * header.cols;
  // The fire restarts from its active front: the cells observed burning during the previous interval.
  // Ground burned before that is spent: it neither re-ignites nor lets the fire through, so flanks and
  // rears that had gone out do not start spreading again (ADR 0058).
  const prevStart = Math.max(0, ...c.observationMinutes.filter((t) => t < startMin - 1e-6), 0);
  const burnedAtStart = new Uint8Array(n);
  const ignitions: Ignition[] = [];
  let spent: Uint8Array | undefined;
  for (let i = 0; i < n; i++) {
    const o = c.observed[i];
    if (!(o <= startMin)) continue;
    burnedAtStart[i] = 1;
    if (startMin > 0 && o <= prevStart && prevStart > 0) (spent ??= new Uint8Array(n))[i] = 1;
    // Whole burned cells: the fire leaves from their edges, where the observed front is on average.
    else ignitions.push({ cell: { row: Math.floor(i / header.cols), col: i % header.cols }, t0Min: 0, burned: true });
  }
  // No cell observed burned yet (an ignition zone smaller than a cell): the cell holding the ignition.
  if (!ignitions.length) {
    const ig = base.ignition;
    burnedAtStart[ig.row * header.cols + ig.col] = 1;
    ignitions.push({ cell: ig, t0Min: 0 });
  }
  let grid = c.grid;
  if (spent) {
    const fuel = c.grid.fuel.slice();
    const baseRate = c.grid.baseRate.slice();
    for (let i = 0; i < n; i++)
      if (spent[i]) {
        fuel[i] = 0;
        baseRate[i] = 0;
      }
    grid = { ...c.grid, fuel, baseRate };
  }
  const durationMin = endMin - startMin;
  const weatherSteps = weatherStepsOf(c, durationMin, startMin, weather, moisture);
  return { ignitions, burnedAtStart, grid, weatherSteps, durationMin };
}

/** Scores every interval of a fire (see the header of this file). */
export function scoreIntervals(
  c: ReferenceCase,
  params?: Partial<ModelParams>,
  opts: IntervalOptions = {},
): IntervalScore[] {
  const {
    spreadModel = "rothermel",
    run,
    seed = 2035,
    weather = "era5",
    moisture = "nfdrs",
    minNewHa = 5,
    freeOnly = false,
  } = opts;
  const slowWeight = freeOnly ? 0 : (opts.slowWeight ?? 0.25);
  const { cellSize } = c.grid.header;
  const cellHa = (cellSize * cellSize) / 10_000;
  const bounds = intervalBounds(c);

  // Observed growth per interval decides which intervals ran freely: growth (ha/h) at or above the
  // fire's median, or an L2 rate above 5 m/min.
  const obsNew = observedNewCells(c);
  const growth = bounds.map(([a, b], k) => (obsNew[k] * cellHa) / ((b - a) / 60));
  const scored = bounds.map((_, k) => obsNew[k] * cellHa >= minNewHa);
  const medianGrowth = percentile(
    growth.filter((_, k) => scored[k]),
    0.5,
  );

  const out: IntervalScore[] = [];
  bounds.forEach(([startMin, endMin], k) => {
    if (!scored[k]) return;
    const dt = endMin - startMin;
    const { scenario, burnedAtStart, grid: g } = intervalScenario(
      c,
      startMin,
      endMin,
      spreadModel,
      params,
      weather,
      moisture,
    );
    const r = simulate(
      g,
      run === undefined ? scenario : { ...scenario, realisation: { seed, run } },
    );
    const dist = startDistance(c, startMin, endMin, weather, moisture);
    const held = heldFlankZone(c, startMin, endMin, weather, moisture);
    let tp = 0,
      fp = 0,
      fn = 0,
      fpHeld = 0;
    const dObs: number[] = [],
      dSim: number[] = [];
    for (let i = 0; i < c.observed.length; i++) {
      const o = c.observed[i];
      if (burnedAtStart[i] || Number.isNaN(o)) continue;
      const s = r.arrivalMin[i] <= dt;
      const b = o > startMin && o <= endMin;
      if (s && b) tp++;
      else if (s) {
        fp++;
        if (held?.[i]) fpHeld++;
      } else if (b) fn++;
      if (s) dSim.push(dist[i] * cellSize);
      if (b) dObs.push(dist[i] * cellSize);
    }
    const l2 = c.intervals?.find(
      (iv) =>
        Math.abs(iv.startMin - startMin) < 1 &&
        Math.abs(iv.endMin - endMin) < 1 &&
        iv.rosMH !== null,
    );
    const l2Rate = l2?.rosMH != null ? l2.rosMH / 60 : null;
    const freeRunning =
      growth[k] >= medianGrowth || (l2Rate !== null && l2Rate > 5);
    out.push({
      fire: c.fire,
      startMin,
      endMin,
      observedNew: tp + fn,
      simulatedNew: tp + fp,
      sorensen: 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : 1,
      growthError: Math.min(MAX_GROWTH_ERROR, Math.abs(Math.log((tp + fp + 1 / cellHa) / (tp + fn + 1 / cellHa)))),
      observedRateMMin: percentile(dObs, 0.9) / dt,
      simulatedRateMMin: percentile(dSim, 0.9) / dt,
      l2RateMMin: l2Rate,
      freeRunning,
      weight: freeRunning ? 1 : slowWeight,
      tp,
      fp,
      fn,
      fpHeld,
      anchor: l2Rate !== null && l2Rate > COVERAGE.anchorMinRateMMin && (l2?.qc ?? 0) >= COVERAGE.anchorMinQc,
    });
  });
  return out;
}

/**
 * Brier score of an ensemble on the intervals: per interval, the burn probability over `runs`
 * realisations (run k with paramSamples[k % n] when given) against the observed new cells. Averaged over
 * a domain that depends only on the observation, the same for every model: the cells within twice the
 * farthest observed new cell (plus 500 m) of the area burned at the start. Lower is better; it rewards
 * spread that is right *and* honest about its uncertainty.
 */
export function brierIntervals(
  c: ReferenceCase,
  params: Partial<ModelParams> | undefined,
  runs: number,
  opts: IntervalOptions & { paramSamples?: Partial<ModelParams>[] } = {},
): { brier: number; cells: number } {
  const { weather = "era5", moisture = "nfdrs", minNewHa = 5, seed = 2035 } = opts;
  const cellHaB = (c.grid.header.cellSize * c.grid.header.cellSize) / 10_000;
  let sum = 0,
    cells = 0;
  for (const [startMin, endMin] of intervalBounds(c)) {
    let observedNew = 0;
    for (let i = 0; i < c.observed.length; i++)
      if (c.observed[i] > startMin && c.observed[i] <= endMin) observedNew++;
    if (observedNew * cellHaB < minNewHa) continue;
    const dt = endMin - startMin;
    const counts = new Uint16Array(c.observed.length);
    let burnedAtStart: Uint8Array | undefined;
    for (let run = 0; run < runs; run++) {
      const sample = opts.paramSamples?.length
        ? opts.paramSamples[run % opts.paramSamples.length]
        : undefined;
      const p = { ...params, ...sample };
      const built = intervalScenario(c, startMin, endMin, opts.spreadModel ?? "rothermel", p, weather, moisture);
      burnedAtStart = built.burnedAtStart;
      const r = simulate(built.grid, { ...built.scenario, realisation: { seed, run } });
      for (let i = 0; i < counts.length; i++) if (r.arrivalMin[i] <= dt) counts[i]++;
    }
    const { cellSize } = c.grid.header;
    const dist = startDistance(c, startMin, endMin, weather, moisture);
    let reach = 0;
    for (let i = 0; i < counts.length; i++)
      if (c.observed[i] > startMin && c.observed[i] <= endMin) reach = Math.max(reach, dist[i]);
    const domain = 2 * reach + 500 / cellSize;
    for (let i = 0; i < counts.length; i++) {
      const o = c.observed[i];
      if (burnedAtStart![i] || Number.isNaN(o) || dist[i] > domain) continue;
      const b = o > startMin && o <= endMin ? 1 : 0;
      const p = counts[i] / runs;
      sum += (p - b) ** 2;
      cells++;
    }
  }
  return { brier: cells ? sum / cells : NaN, cells };
}

/** Pooled ensemble scores over intervals: sums, so fires and intervals add up. */
export interface EnsembleTally {
  cells: number;
  /** Σ (p − o)² over the domain cells. */
  sqErr: number;
  /** Per probability bin (TALLY_BINS bins, p = 1 in the last): cells, Σ p, Σ observed. */
  bins: { n: number; sumP: number; sumObs: number }[];
  /** Observed new cells, and how many of them had p ≥ 0.1 (the map "saw it coming"). */
  observedNew: number;
  covered: number;
  /** Cells with p ≥ 0.5 (the likely area). */
  likely: number;
}

export const TALLY_BINS = 20;

export const emptyTally = (): EnsembleTally => ({
  cells: 0,
  sqErr: 0,
  bins: Array.from({ length: TALLY_BINS }, () => ({ n: 0, sumP: 0, sumObs: 0 })),
  observedNew: 0,
  covered: 0,
  likely: 0,
});

export function addTally(a: EnsembleTally, b: EnsembleTally): EnsembleTally {
  return {
    cells: a.cells + b.cells,
    sqErr: a.sqErr + b.sqErr,
    bins: a.bins.map((x, k) => ({ n: x.n + b.bins[k].n, sumP: x.sumP + b.bins[k].sumP, sumObs: x.sumObs + b.bins[k].sumObs })),
    observedNew: a.observedNew + b.observedNew,
    covered: a.covered + b.covered,
    likely: a.likely + b.likely,
  };
}

/**
 * The app's ensemble (simulate with `ensemble`: wind jitter, calibration samples and perturbations)
 * on every interval of a fire, tallied against the observed new cells in the same fixed domain as
 * brierIntervals. What is measured is what the probability map shows.
 */
export function ensembleIntervals(
  c: ReferenceCase,
  params: Partial<ModelParams> | undefined,
  ensemble: EnsembleOptions,
  opts: IntervalOptions = {},
): { all: EnsembleTally; free: EnsembleTally } {
  const { weather = "era5", moisture = "nfdrs", minNewHa = 5 } = opts;
  let t = emptyTally();
  let free = emptyTally();
  // Free-running intervals as in scoreIntervals: growth at or above the fire's median, or L2 > 5 m/min.
  const { cellSize: cs } = c.grid.header;
  const bounds = intervalBounds(c);
  const obsNew = observedNewCells(c);
  const growth = bounds.map(([a, b], k) => (obsNew[k] * cs * cs) / ((b - a) / 60));
  const csHa = (cs * cs) / 10_000;
  const scoredGrowth = growth.filter((_, k) => obsNew[k] * csHa >= minNewHa).sort((x, y) => x - y);
  const medianGrowth = scoredGrowth.length ? scoredGrowth[Math.floor(scoredGrowth.length / 2)] : 0;
  for (const [k, [startMin, endMin]] of bounds.entries()) {
    const observedNew = obsNew[k];
    if (observedNew * csHa < minNewHa) continue;
    const l2 = c.intervals?.find((iv) => Math.abs(iv.startMin - startMin) < 1 && Math.abs(iv.endMin - endMin) < 1 && iv.rosMH !== null);
    const isFree = growth[k] >= medianGrowth || (l2?.rosMH != null && l2.rosMH / 60 > 5);
    const { scenario, burnedAtStart, grid: g } = intervalScenario(c, startMin, endMin, opts.spreadModel ?? "rothermel", params, weather, moisture);
    const r = simulate(g, { ...scenario, ensemble });
    const p = r.burnProbability!;
    const { cellSize } = c.grid.header;
    const dist = startDistance(c, startMin, endMin, weather, moisture);
    let reach = 0;
    for (let i = 0; i < p.length; i++)
      if (c.observed[i] > startMin && c.observed[i] <= endMin) reach = Math.max(reach, dist[i]);
    const domain = 2 * reach + 500 / cellSize;
    const u = emptyTally();
    for (let i = 0; i < p.length; i++) {
      const o = c.observed[i];
      if (burnedAtStart[i] || Number.isNaN(o) || dist[i] > domain) continue;
      const b = o > startMin && o <= endMin ? 1 : 0;
      u.cells++;
      u.sqErr += (p[i] - b) ** 2;
      const bin = u.bins[Math.min(TALLY_BINS - 1, Math.floor(p[i] * TALLY_BINS))];
      bin.n++;
      bin.sumP += p[i];
      bin.sumObs += b;
      if (b) {
        u.observedNew++;
        if (p[i] >= 0.1) u.covered++;
      }
      if (p[i] >= 0.5) u.likely++;
    }
    t = addTally(t, u);
    if (isFree) free = addTally(free, u);
  }
  return { all: t, free };
}

/**
 * Monotone (isotonic, pool-adjacent-violators) map from the ensemble's share of runs to the observed
 * chance of burning, fitted on binned tallies. Returns one value per bin, non-decreasing.
 */
export function isotonicMap(t: EnsembleTally): number[] {
  const blocks: { w: number; v: number; bins: number }[] = [];
  for (const b of t.bins) {
    blocks.push({ w: b.n, v: b.n ? b.sumObs / b.n : 0, bins: 1 });
    while (blocks.length > 1) {
      const [x, y] = blocks.slice(-2);
      if (x.v <= y.v || y.w === 0) {
        if (y.w === 0) {
          blocks.pop();
          blocks[blocks.length - 1].bins += 1;
        }
        break;
      }
      blocks.splice(-2, 2, { w: x.w + y.w, v: (x.w * x.v + y.w * y.v) / (x.w + y.w), bins: x.bins + y.bins });
    }
  }
  return blocks.flatMap((b) => Array(b.bins).fill(b.v));
}

/** Tally after mapping each bin's probability through `map` (constant within a bin). */
export function mappedTally(t: EnsembleTally, map: number[]): EnsembleTally {
  let sqErr = 0,
    covered = 0,
    likely = 0;
  const bins = t.bins.map((b, k) => {
    const q = map[k];
    sqErr += b.n * q * q - 2 * q * b.sumObs + b.sumObs;
    if (q >= 0.1) covered += b.sumObs;
    if (q >= 0.5) likely += b.n;
    return { n: b.n, sumP: q * b.n, sumObs: b.sumObs };
  });
  return { ...t, sqErr, bins, covered, likely };
}

/**
 * The app's ensemble from the observed ignition, as a planner would run it, scored at up to
 * `maxTimes` observation times (each its own ensemble of that duration): the burn probability
 * against the cells observed burned by then. Domain: cells within twice the farthest observed burned
 * cell (plus 500 m) of the ignition area; ignition cells and cells burned at an unknown time left out.
 */
export function ensembleFromIgnition(
  c: ReferenceCase,
  params: Partial<ModelParams> | undefined,
  ensemble: EnsembleOptions,
  opts: IntervalOptions & { maxTimes?: number; firstOnly?: boolean } = {},
): EnsembleTally {
  const parts = ensembleFromIgnitionParts(c, params, ensemble, opts);
  return opts.firstOnly ? parts.early : parts.fromIgnition;
}

/**
 * ensembleFromIgnition at the picked times and at the first observation ("early", firstOnly), from one
 * ensemble run to the last of them: arrivals before a time do not depend on how long the runs go on.
 */
export function ensembleFromIgnitionParts(
  c: ReferenceCase,
  params: Partial<ModelParams> | undefined,
  ensemble: EnsembleOptions,
  opts: IntervalOptions & { maxTimes?: number } = {},
): { fromIgnition: EnsembleTally; early: EnsembleTally } {
  const { weather = "era5", moisture = "nfdrs", maxTimes = 4 } = opts;
  const times = c.observationMinutes;
  const pick =
    times.length <= maxTimes ? times : Array.from({ length: maxTimes }, (_, k) => times[Math.round(((k + 1) * times.length) / maxTimes) - 1]);
  const { scenario: first, burnedAtStart } = intervalScenario(c, 0, times[0], opts.spreadModel ?? "rothermel", params, weather, moisture);
  const { cellSize } = c.grid.header;
  const dist = startDistance(c, 0, times[0], weather, moisture);
  const at = [times[0], ...pick];
  const lastMin = Math.max(...at);
  const weatherSteps = weatherStepsOf(c, lastMin, 0, weather, moisture);
  const r = simulate(c.grid, { ...first, durationMin: lastMin, weatherSteps, wind: weatherSteps[0].wind, ensemble, probabilityAtMin: at });
  const tallyAt = (k: number) => {
    const atMin = at[k];
    const p = r.burnProbabilityAt![k];
    let reach = 0;
    for (let i = 0; i < p.length; i++) if (c.observed[i] > 0 && c.observed[i] <= atMin) reach = Math.max(reach, dist[i]);
    const domain = 2 * reach + 500 / cellSize;
    const u = emptyTally();
    for (let i = 0; i < p.length; i++) {
      const o = c.observed[i];
      if (burnedAtStart[i] || Number.isNaN(o) || dist[i] > domain) continue;
      const b = o <= atMin ? 1 : 0;
      u.cells++;
      u.sqErr += (p[i] - b) ** 2;
      const bin = u.bins[Math.min(TALLY_BINS - 1, Math.floor(p[i] * TALLY_BINS))];
      bin.n++;
      bin.sumP += p[i];
      bin.sumObs += b;
      if (b) {
        u.observedNew++;
        if (p[i] >= 0.1) u.covered++;
      }
      if (p[i] >= 0.5) u.likely++;
    }
    return u;
  };
  let fromIgnition = emptyTally();
  for (let k = 1; k < at.length; k++) fromIgnition = addTally(fromIgnition, tallyAt(k));
  return { fromIgnition, early: addTally(emptyTally(), tallyAt(0)) };
}


/** Spread rates (m/min) of the intervals with a measured L2 rate, as [simulated, observed, L2]. */
export function rateSamples(scores: IntervalScore[]): [number, number, number][] {
  return scores.filter((s) => s.l2RateMMin !== null).map((s) => [s.simulatedRateMMin, s.observedRateMMin, s.l2RateMMin!]);
}

/**
 * Fast runs (L2 above 15 m/min) and slow spread (L2 below 5 m/min): median of simulated / observed
 * rate (1 = right, below 1 = too slow) and the share of intervals within a factor of 1.5.
 */
export function rateSummary(samples: [number, number, number][]): { fast: RateStats; slow: RateStats } {
  const stats = (xs: [number, number, number][]): RateStats => {
    const r = xs.filter(([, o]) => o > 0).map(([s, o]) => s / o).sort((a, b) => a - b);
    return {
      n: r.length,
      medianRatio: r.length ? r[Math.floor(r.length / 2)] : NaN,
      within15: r.length ? r.filter((x) => x >= 1 / 1.5 && x <= 1.5).length / r.length : NaN,
    };
  };
  return { fast: stats(samples.filter((x) => x[2] > 15)), slow: stats(samples.filter((x) => x[2] < 5)) };
}

export interface RateStats {
  n: number;
  medianRatio: number;
  within15: number;
}
