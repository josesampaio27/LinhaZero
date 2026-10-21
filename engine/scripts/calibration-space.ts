// The parameters the calibration fits, and how a point of the search space maps to them.
// Factors are searched in log space (a factor of 2 and of 0.5 are equally far from 1); the dead fuel
// moisture offset in points of moisture. A weak prior pulls everything towards the physical defaults, so
// a parameter the fires say little about stays near 1 instead of wandering.
import { DEFAULT_PARAMS, PARAM_RANGES, type ModelParams } from "../src/params";

export interface Dimension {
  name: keyof ModelParams;
  /** "log": x = ln(value); "points": x = value / 0.01; "share": x = value (0–1, prior towards 0). */
  kind: "log" | "points" | "share";
  /** Bounds of x. */
  lo: number;
  hi: number;
}

const logRange = (name: keyof ModelParams): [number, number] => {
  const [a, b] = PARAM_RANGES[name];
  return [Math.log(a), Math.log(b)];
};
const logDim = (name: keyof ModelParams): Dimension => {
  const [lo, hi] = logRange(name);
  return { name, kind: "log", lo, hi };
};

/** Per fuel group (ADR 0054). */
export const SPACE: Dimension[] = [
  logDim("rosAdjLitter"),
  logDim("rosAdjUnderstory"),
  logDim("rosAdjShrub"),
  logDim("rosAdjGrass"),
  logDim("windAdj"),
  logDim("holdWidthPerFlame"),
  { name: "deadMoistureOffset", kind: "points", lo: -3, hi: 3 },
];

/** Named search spaces (calibrate.ts --space). */
export const SPACES: Record<string, Dimension[]> = {
  groups: SPACE,
  /** The three numbers of PT_CALIBRATION. */
  global: [logDim("rosAdj"), logDim("windAdj"), logDim("holdWidthPerFlame")],
  /**
   * Per fuel group for the fuels that carry Guimarães's fires (understory, shrub, grass), the midflame
   * wind, the line hold and the crown fire rate; litter and the moisture offset stay physical (ADR 0064).
   */
  groupsCrown: [
    logDim("rosAdjUnderstory"),
    logDim("rosAdjShrub"),
    logDim("rosAdjGrass"),
    logDim("windAdj"),
    logDim("holdWidthPerFlame"),
    logDim("crownAdj"),
  ],
  /**
   * groupsCrown plus a calibration-only firefighting layer (bgSuppression, ADR 0068 hypothesis): the
   * firefighting of the real fires gets its own factor, fitted with the physics and never shipped. The
   * prior pulls it to 1 (none), like every other factor.
   */
  groupsCrownSupp: [
    logDim("rosAdjUnderstory"),
    logDim("rosAdjShrub"),
    logDim("rosAdjGrass"),
    logDim("windAdj"),
    logDim("holdWidthPerFlame"),
    logDim("crownAdj"),
    logDim("bgSuppression"),
  ],
  /** The same without crown fire (crownFire=0): the crown on/off hypothesis. */
  groupsNoCrown: [logDim("rosAdjUnderstory"), logDim("rosAdjShrub"), logDim("rosAdjGrass"), logDim("windAdj"), logDim("holdWidthPerFlame")],

  /** Plus the crown fire rate factor. */
  globalCrown: [logDim("rosAdj"), logDim("windAdj"), logDim("holdWidthPerFlame"), logDim("crownAdj")],
  /** Plus the share of the gust in the wind (linear, 0–1). */
  globalCrownGust: [
    logDim("rosAdj"),
    logDim("windAdj"),
    logDim("holdWidthPerFlame"),
    logDim("crownAdj"),
    { name: "gustShare", kind: "share", lo: 0, hi: 1 },
  ],
};

/** Weight of the prior: PRIOR_WEIGHT × Σ x² (x = ln factor, or points / 3 for the moisture offset). */
export const PRIOR_WEIGHT = 0.01;

export const clampX = (x: number[], space: Dimension[] = SPACE) =>
  x.map((v, i) => Math.min(space[i].hi, Math.max(space[i].lo, v)));

/** Parameters of a point in the search space (clamped to the bounds). */
export function toParams(x: number[], space: Dimension[] = SPACE): Partial<ModelParams> {
  const p: Partial<ModelParams> = {};
  clampX(x, space).forEach((v, i) => {
    const d = space[i];
    p[d.name] = d.kind === "log" ? Math.exp(v) : d.kind === "share" ? v : v * 0.01;
  });
  return p;
}

/** The point of the search space of a parameter set (missing ones at their defaults). */
export function fromParams(p: Partial<ModelParams>, space: Dimension[] = SPACE): number[] {
  return space.map((d) => {
    const v = p[d.name] ?? DEFAULT_PARAMS[d.name];
    return d.kind === "log" ? Math.log(v) : d.kind === "share" ? v : v / 0.01;
  });
}

/** Prior penalty, plus a quadratic penalty for leaving the bounds (CMA-ES samples are not bounded). */
export function penalty(x: number[], space: Dimension[] = SPACE): number {
  let s = 0;
  x.forEach((v, i) => {
    const d = space[i];
    const u = d.kind === "log" ? v : d.kind === "share" ? v : v / 3;
    s += PRIOR_WEIGHT * u * u;
    if (v < d.lo) s += (d.lo - v) ** 2;
    if (v > d.hi) s += (v - d.hi) ** 2;
  });
  return s;
}

/**
 * The current global calibration (rosAdj 0.5 on every fuel) as a point of this space, so it can be scored
 * and used as a starting point: rosAdj folded into the four group factors.
 */
export function fromGlobal(p: Partial<ModelParams>): number[] {
  const r = p.rosAdj ?? 1;
  return fromParams({
    ...p,
    rosAdjLitter: r * (p.rosAdjLitter ?? 1),
    rosAdjUnderstory: r * (p.rosAdjUnderstory ?? 1),
    rosAdjShrub: r * (p.rosAdjShrub ?? 1),
    rosAdjGrass: r * (p.rosAdjGrass ?? 1),
  });
}
