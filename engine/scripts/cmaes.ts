// A small CMA-ES (Hansen 2016, "The CMA Evolution Strategy: A Tutorial"), (μ/μ_w, λ) with rank-one and
// rank-μ updates and cumulative step-size adaptation. Minimises; seeded, so a run is reproducible.
// Evaluation is batched (one generation at a time), so the caller can spread it over worker threads.
import { createRng } from "../src/random";

export interface CmaesOptions {
  /** Initial step size, in the units of x. */
  sigma: number;
  /** Population per generation (default 4 + 3 ln n). */
  lambda?: number;
  maxGenerations?: number;
  seed?: number;
  /** Stop when the step size times the largest axis falls below this. */
  tolX?: number;
  /**
   * Stop on a plateau: the best has improved by less than `gain` over the last `window` generations and
   * the step size times the largest axis is below `step` (both, so a fit still moving is not cut).
   */
  tolFun?: { window: number; gain: number; step: number };
  onGeneration?: (gen: number, best: { x: number[]; f: number }, sigma: number) => void;
}

export interface CmaesResult {
  x: number[];
  f: number;
  generations: number;
  evaluations: number;
}

/** Symmetric eigendecomposition by cyclic Jacobi rotations (n is small here). Returns B (columns) and D². */
export function eigenSym(a: number[][]): { vectors: number[][]; values: number[] } {
  const n = a.length;
  const m = a.map((r) => [...r]);
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j): number => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += m[p][q] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(m[p][q]) < 1e-300) continue;
        const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1),
          s = t * c;
        for (let k = 0; k < n; k++) {
          const mkp = m[k][p],
            mkq = m[k][q];
          m[k][p] = c * mkp - s * mkq;
          m[k][q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < n; k++) {
          const mpk = m[p][k],
            mqk = m[q][k];
          m[p][k] = c * mpk - s * mqk;
          m[q][k] = s * mpk + c * mqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p],
            vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
  }
  return { vectors: v, values: m.map((r, i) => Math.max(r[i], 1e-20)) };
}

/** Minimises f starting from x0. `evaluate` scores a whole generation and may run it in parallel. */
export async function cmaes(
  evaluate: (xs: number[][]) => Promise<number[]>,
  x0: number[],
  opts: CmaesOptions,
): Promise<CmaesResult> {
  const n = x0.length;
  const lambda = opts.lambda ?? 4 + Math.floor(3 * Math.log(n));
  const mu = Math.floor(lambda / 2);
  const rawW = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1));
  const sumW = rawW.reduce((a, b) => a + b, 0);
  const w = rawW.map((x) => x / sumW);
  const mueff = 1 / w.reduce((a, b) => a + b * b, 0);
  const cc = (4 + mueff / n) / (n + 4 + (2 * mueff) / n);
  const cs = (mueff + 2) / (n + mueff + 5);
  const c1 = 2 / ((n + 1.3) ** 2 + mueff);
  const cmu = Math.min(1 - c1, (2 * (mueff - 2 + 1 / mueff)) / ((n + 2) ** 2 + mueff));
  const damps = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs;
  const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));

  const rng = createRng(opts.seed ?? 1);
  const gauss = () => {
    const u = Math.max(rng(), 1e-12),
      v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  let mean = [...x0];
  let sigma = opts.sigma;
  let C = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j): number => (i === j ? 1 : 0)));
  let B = C.map((r) => [...r]);
  let D = new Array(n).fill(1);
  const pc = new Array(n).fill(0);
  const ps = new Array(n).fill(0);
  let best = { x: [...x0], f: Infinity };
  let evaluations = 0;
  /** The best value after each generation (for tolFun). */
  const bestByGen: number[] = [];
  const maxGen = opts.maxGenerations ?? 100;
  let gen = 0;
  for (; gen < maxGen; gen++) {
    const zs: number[][] = [],
      ys: number[][] = [],
      xs: number[][] = [];
    for (let k = 0; k < lambda; k++) {
      const z = Array.from({ length: n }, gauss);
      const y = B.map((row) => row.reduce((s, b, j) => s + b * D[j] * z[j], 0));
      zs.push(z);
      ys.push(y);
      xs.push(mean.map((m, i) => m + sigma * y[i]));
    }
    const fs = await evaluate(xs);
    evaluations += lambda;
    const order = fs.map((f, k) => [f, k] as const).sort((a, b) => a[0] - b[0]).map(([, k]) => k);
    if (fs[order[0]] < best.f) best = { x: [...xs[order[0]]], f: fs[order[0]] };

    const yw = new Array(n).fill(0);
    for (let i = 0; i < mu; i++) for (let j = 0; j < n; j++) yw[j] += w[i] * ys[order[i]][j];
    mean = mean.map((m, j) => m + sigma * yw[j]);

    // C^{-1/2} yw = B D^{-1} Bᵀ yw
    const bty = B[0].map((_, j) => B.reduce((s, row, i) => s + row[j] * yw[i], 0));
    const invsq = B.map((row) => row.reduce((s, b, j) => s + (b * bty[j]) / D[j], 0));
    for (let j = 0; j < n; j++) ps[j] = (1 - cs) * ps[j] + Math.sqrt(cs * (2 - cs) * mueff) * invsq[j];
    const psNorm = Math.sqrt(ps.reduce((a, b) => a + b * b, 0));
    const hsig = psNorm / Math.sqrt(1 - (1 - cs) ** (2 * (gen + 1))) / chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
    for (let j = 0; j < n; j++) pc[j] = (1 - cc) * pc[j] + hsig * Math.sqrt(cc * (2 - cc) * mueff) * yw[j];

    const Cn = C.map((row, i) =>
      row.map((cij, j) => {
        let rankMu = 0;
        for (let k = 0; k < mu; k++) rankMu += w[k] * ys[order[k]][i] * ys[order[k]][j];
        return (
          (1 - c1 - cmu) * cij +
          c1 * (pc[i] * pc[j] + (1 - hsig) * cc * (2 - cc) * cij) +
          cmu * rankMu
        );
      }),
    );
    C = Cn;
    sigma *= Math.exp((cs / damps) * (psNorm / chiN - 1));
    const e = eigenSym(C);
    B = e.vectors;
    D = e.values.map(Math.sqrt);
    opts.onGeneration?.(gen, best, sigma);
    bestByGen.push(best.f);
    if (sigma * Math.max(...D) < (opts.tolX ?? 1e-4)) {
      gen++;
      break;
    }
    const tf = opts.tolFun;
    if (tf && gen >= tf.window && bestByGen[gen - tf.window] - best.f < tf.gain && sigma * Math.max(...D) < tf.step) {
      gen++;
      break;
    }
  }
  return { x: best.x, f: best.f, generations: gen, evaluations };
}
