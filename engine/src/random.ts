/** Seeded pseudo-random generator (mulberry32); returns a function yielding numbers in [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Counter-based random number in [0, 1) from integers (seed, run, purpose, cell). The same inputs
 * always give the same number, whatever else the simulation draws, so run k of two decisions sees
 * the same "luck" in every cell (the pairing contract), however many cells each one visits.
 */
export function hashRandom(seed: number, run: number, purpose: number, cell: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(run + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) ^ Math.imul(purpose + 0x2545f491, 0x846ca68b);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) ^ cell;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Purposes of hashRandom draws (each a separate stream). */
export const RANDOM_PURPOSE = {
  breach: 1,
  spot: 2,
  spotDistance: 3,
  spotDirection: 4,
  moisture: 5,
  fuelGroup: 6,
  ignition: 7,
  /** Whether an aerial drop holds the fire crossing a cell (ensemble runs). */
  dropHold: 8,
} as const;

/** Standard normal from two counter-based draws (Box-Muller), stream `purpose`, index k. */
export function hashNormal(seed: number, run: number, purpose: number, k: number): number {
  const u = Math.max(hashRandom(seed, run, purpose, 2 * k), 1e-12);
  const v = hashRandom(seed, run, purpose, 2 * k + 1);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
