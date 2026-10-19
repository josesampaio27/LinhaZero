import type { GridData, Metrics, RunMetrics } from "./types";

/**
 * Summarises an arrival raster (minutes): hectares burned at the end of each hour, buildings in
 * cells reached within durationMin and the first arrival minute at each village.
 */
export function computeMetrics(grid: GridData, arrival: Float32Array, durationMin: number): Metrics {
  const { cellSize, villages } = grid.header;
  const cellHa = (cellSize * cellSize) / 10000;
  const hours = Math.max(1, Math.ceil(durationMin / 60));
  const perHour = new Float64Array(hours);
  const firstArrival = new Map<number, number>();
  let buildingsReached = 0;

  for (let i = 0; i < arrival.length; i++) {
    const t = arrival[i];
    if (!(t <= durationMin)) continue;
    perHour[Math.min(hours - 1, Math.max(0, Math.ceil(t / 60) - 1))] += cellHa;
    buildingsReached += grid.buildings[i];
    const v = grid.village[i];
    if (v !== 0) {
      const prev = firstArrival.get(v);
      if (prev === undefined || t < prev) firstArrival.set(v, t);
    }
  }

  const burnedHaByHour: number[] = [];
  let acc = 0;
  for (let h = 0; h < hours; h++) {
    acc += perHour[h];
    burnedHaByHour.push(acc);
  }
  return {
    burnedHaByHour,
    buildingsReached,
    villages: villages.map(({ id, name }) => ({
      id,
      name,
      firstArrivalMin: firstArrival.get(id) ?? null,
    })),
  };
}

export interface PairedComparison {
  runs: number;
  /** Number of runs where B has a lower value than A, A lower than B, or both equal. */
  bBetter: number;
  aBetter: number;
  ties: number;
  /** Gain = A - B per run (positive means B is better): median and the central 80% of runs. */
  lowGain: number;
  medianGain: number;
  highGain: number;
}

/**
 * Compares two ensembles run by run (run k of A against run k of B, which share the same wind).
 * Lower is better for every RunMetrics field. Throws if the run counts differ or are zero.
 *
 * The statistics are symmetric: comparePaired(b, a) is comparePaired(a, b) with the gains negated
 * and the interval ends swapped, so the result does not depend on which decision is called A.
 */
export function comparePaired(a: RunMetrics[], b: RunMetrics[], key: keyof RunMetrics): PairedComparison {
  if (a.length !== b.length || a.length === 0) {
    throw new Error(`Unpaired ensembles: ${a.length} and ${b.length} runs`);
  }
  const n = a.length;
  const g = a.map((ra, k) => ra[key] - b[k][key]).sort((x, y) => x - y);
  // Drop the k smallest and k largest gains (10% on each side) to keep the central 80%: 4th to 27th of 30.
  const k = Math.floor(n / 10);
  const bBetter = g.filter((v) => v > 0).length;
  const aBetter = g.filter((v) => v < 0).length;
  return {
    runs: n,
    bBetter,
    aBetter,
    ties: n - bBetter - aBetter,
    lowGain: g[k],
    medianGain: (g[(n - 1) >> 1] + g[n >> 1]) / 2,
    highGain: g[n - 1 - k],
  };
}
