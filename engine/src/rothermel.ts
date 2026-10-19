// Rothermel (1972) surface fire spread with the Albini (1976) adjustments, as consolidated by
// Andrews (2018, RMRS-GTR-371) and implemented in BehavePlus. Inputs and outputs are SI; the
// equations run in the original US units (ft, lb, Btu, min) because their empirical constants
// are fitted in those units. Tests compare against the Behave C++ code (via pyrothermel).

/** Size classes of a fuel model's inputs, in this order: dead 1 h, 10 h, 100 h; live herbaceous; live woody. */
export const SIZE_CLASSES = [
  "d1",
  "d10",
  "d100",
  "liveHerb",
  "liveWoody",
] as const;
// Internally a sixth class holds cured (dead) herbaceous fuel: d1, d10, d100, dead herb | live herb, live woody.
const N = 6;
const LIVE_FIRST = 4; // classes 0..3 are dead, 4..5 live

/** Surface fuel model in SI units. */
export interface FuelParams {
  /** Fuel bed depth, m. */
  depthM: number;
  /** Dead fuel moisture of extinction, fraction (0.25 = 25%). */
  deadMoistExt: number;
  /** Low heat content, kJ/kg (18 608 = the standard 8000 Btu/lb). */
  heatKjKg: number;
  /** Oven-dry load per size class, kg/m². */
  load: readonly [number, number, number, number, number];
  /** Surface-area-to-volume ratio per size class, 1/m (10 h and 100 h are usually 357.6 and 98.4). */
  sav: readonly [number, number, number, number, number];
  /** Wind adjustment factor (10-m open wind is converted to 20-ft wind first). Omitted: unsheltered value from the depth. */
  waf?: number;
  /**
   * Dynamic model (Scott and Burgan 2005): herbaceous fuel cures with its moisture, moving from the
   * live to the dead category (fully cured at ≤ 30%, fully green at ≥ 120%).
   */
  dynamic?: boolean;
  /**
   * Litter or understory under a forest canopy (FUMOD groups F and M): the wind is sheltered by the
   * cell's tree cover when the grid has it. Shrub and grass models (group V) are the fuel themselves.
   */
  underCanopy?: boolean;
  /** Calibration group: F litter, M understory, V shrub, H grass (each has its own spread factor). */
  group?: FuelGroup;
  /** Tree canopy above the surface fuel, for crown fire (engine/src/crown.ts); omitted = no crown fire. */
  crown?: CanopyFuel;
}

/** Canopy fuel of a forest fuel model (assumed per model; data-prep/fuel_params.csv). */
export interface CanopyFuel {
  /** Canopy base height, m. */
  cbhM: number;
  /** Canopy bulk density, kg/m³. */
  cbdKgM3: number;
  /** Canopy fuel load available to a crown fire, kg/m². */
  cflKgM2: number;
}

export type FuelGroup = "F" | "M" | "V" | "H";

/** Fuel moisture per size class, fractions of oven-dry weight. */
export interface FuelMoisture {
  d1: number;
  d10: number;
  d100: number;
  liveHerb: number;
  liveWoody: number;
}

/** A dry summer afternoon; the default until moisture is computed from the weather. */
export const DEFAULT_MOISTURE: FuelMoisture = {
  d1: 0.06,
  d10: 0.07,
  d100: 0.08,
  liveHerb: 0.6,
  liveWoody: 0.9,
};

// Unit conversions.
const KGM2_TO_LBFT2 = 0.204816;
const PER_M_TO_PER_FT = 0.3048;
const M_TO_FT = 1 / 0.3048;
const KJKG_TO_BTULB = 1 / 2.326;
const FT_TO_M = 0.3048;
const BTU_FT_S_TO_KW_M = 3.46141;
const FTMIN_TO_MPH = 60 / 5280;
const MS_TO_FTMIN = 60 * M_TO_FT;

/** 20-ft wind as a fraction of 10-m wind over open ground (Turner and Lawson 1978). */
export const WIND_20FT_PER_10M = 1 / 1.15;
/** Upper bound of the length-to-breadth ratio, as in BehavePlus. */
export const MAX_LENGTH_TO_BREADTH = 8;

const PARTICLE_DENSITY = 32; // lb/ft³
const TOTAL_MINERAL = 0.0555;
const EFFECTIVE_MINERAL = 0.01;

/** Values of a fuel model that do not depend on moisture (except herbaceous curing in dynamic models). */
export interface FuelBed {
  params: FuelParams;
  depthFt: number;
  load: Float64Array; // lb/ft²
  sav: Float64Array; // 1/ft
  heat: number; // Btu/lb
  mxDead: number;
  /** Weight of each class within its category (surface-area fraction, f_ij). */
  fij: Float64Array;
  /** Weight of the dead and live categories (f_i). */
  fDead: number;
  fLive: number;
  /** Size-class weights used for the net load (g_ij, Albini 1976). */
  gij: Float64Array;
  /** exp(-138/σ) and exp(-500/σ) per class. */
  eps138: Float64Array;
  eps500: Float64Array;
  sigma: number; // characteristic SAV, 1/ft
  beta: number; // packing ratio
  ratio: number; // beta / beta_op
  bulkDensity: number; // lb/ft³
  gammaPrime: number; // optimum reaction velocity, 1/min
  xi: number; // propagating flux ratio
  windB: number;
  windC: number;
  windE: number;
  slopeK: number; // phi_S = slopeK * tan²
  residenceMin: number;
  waf: number;
  burnable: boolean;
}

/** BehavePlus size bins (by SAV, 1/ft) used to weight the net load. */
function sizeBin(sav: number): number {
  if (sav >= 1200) return 1;
  if (sav >= 192) return 2;
  if (sav >= 96) return 3;
  if (sav >= 48) return 4;
  if (sav >= 16) return 5;
  return 6;
}

/** Unsheltered wind adjustment factor from fuel bed depth (Albini and Baughman 1979). */
export function unshelteredWaf(depthM: number): number {
  const d = depthM * M_TO_FT;
  return d > 0 ? 1.83 / Math.log((20 + 0.36 * d) / (0.13 * d)) : 0;
}

/**
 * Canopy height used with the tree cover layer, m. There is no canopy height layer yet; the factor
 * barely depends on it (0.12 at 8 m, 0.11 at 15 m, 0.10 at 25 m for 50% cover).
 */
export const ASSUMED_CANOPY_HEIGHT_M = 12;

/**
 * Wind adjustment factor of a fuel bed, as in BehavePlus (Albini and Baughman 1979; Andrews 2012):
 * sheltered by the canopy when its crown fill (cover / 3) is at least 5% and it is at least 6 ft
 * tall, otherwise the unsheltered value from the fuel bed depth. canopyCover is a fraction (0–1).
 */
export function windAdjustmentFactor(
  depthM: number,
  canopyCover: number,
  canopyHeightM = ASSUMED_CANOPY_HEIGHT_M,
): number {
  const h = canopyHeightM * M_TO_FT;
  const crownFill = canopyCover / 3;
  if (crownFill >= 0.05 && h >= 6) {
    return (
      0.555 /
      (Math.sqrt(crownFill * h) * Math.log((20 + 0.36 * h) / (0.13 * h)))
    );
  }
  return unshelteredWaf(depthM);
}

/** Fraction of the herbaceous load that is cured (dead), from live herbaceous moisture (BehavePlus). */
export function curedFraction(liveHerbMoisture: number): number {
  return 1 - Math.min(1, Math.max(0, liveHerbMoisture / 0.9 - 1 / 3));
}

/** Prepares a fuel model; the moisture only matters for the curing of dynamic models. */
export function prepareFuelBed(
  p: FuelParams,
  m: FuelMoisture = DEFAULT_MOISTURE,
): FuelBed {
  const [w1, w10, w100, wHerb, wWoody] = p.load;
  const [s1, s10, s100, sHerb, sWoody] = p.sav;
  const cured = p.dynamic ? curedFraction(m.liveHerb) : 0;
  const load = Float64Array.from(
    [w1, w10, w100, wHerb * cured, wHerb * (1 - cured), wWoody],
    (w) => w * KGM2_TO_LBFT2,
  );
  const sav = Float64Array.from(
    [s1, s10, s100, sHerb, sHerb, sWoody],
    (s) => s * PER_M_TO_PER_FT,
  );
  const depthFt = p.depthM * M_TO_FT;
  const area = new Float64Array(N);
  let aDead = 0,
    aLive = 0,
    wTotal = 0;
  for (let i = 0; i < N; i++) {
    if (!(load[i] > 0 && sav[i] > 0)) load[i] = 0;
    area[i] = (sav[i] * load[i]) / PARTICLE_DENSITY;
    if (i < LIVE_FIRST) aDead += area[i];
    else aLive += area[i];
    wTotal += load[i];
  }
  const aTotal = aDead + aLive;
  const fij = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const aCat = i < LIVE_FIRST ? aDead : aLive;
    fij[i] = aCat > 0 ? area[i] / aCat : 0;
  }
  const fDead = aTotal > 0 ? aDead / aTotal : 0;
  const fLive = aTotal > 0 ? aLive / aTotal : 0;
  const gij = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (load[i] === 0) continue;
    const bin = sizeBin(sav[i]);
    const [from, to] = i < LIVE_FIRST ? [0, LIVE_FIRST] : [LIVE_FIRST, N];
    for (let k = from; k < to; k++)
      if (load[k] > 0 && sizeBin(sav[k]) === bin) gij[i] += fij[k];
  }
  const eps138 = Float64Array.from(sav, (s) =>
    s > 0 ? Math.exp(-138 / s) : 0,
  );
  const eps500 = Float64Array.from(sav, (s) =>
    s > 0 ? Math.exp(-500 / s) : 0,
  );

  let sigDead = 0,
    sigLive = 0;
  for (let i = 0; i < N; i++) {
    if (i < LIVE_FIRST) sigDead += fij[i] * sav[i];
    else sigLive += fij[i] * sav[i];
  }
  const sigma = fDead * sigDead + fLive * sigLive;
  const bulkDensity = depthFt > 0 ? wTotal / depthFt : 0;
  const beta = bulkDensity / PARTICLE_DENSITY;
  const betaOp = sigma > 0 ? 3.348 * Math.pow(sigma, -0.8189) : 1;
  const ratio = beta / betaOp;
  const a = sigma > 0 ? 133 * Math.pow(sigma, -0.7913) : 0;
  const s15 = Math.pow(sigma, 1.5);
  const gammaMax = s15 / (495 + 0.0594 * s15);
  const gammaPrime =
    ratio > 0 ? gammaMax * Math.pow(ratio, a) * Math.exp(a * (1 - ratio)) : 0;
  const xi =
    Math.exp((0.792 + 0.681 * Math.sqrt(sigma)) * (beta + 0.1)) /
    (192 + 0.2595 * sigma);
  const burnable = wTotal > 0 && depthFt > 0 && sigma > 0 && p.deadMoistExt > 0;
  return {
    params: p,
    depthFt,
    load,
    sav,
    heat: p.heatKjKg * KJKG_TO_BTULB,
    mxDead: p.deadMoistExt,
    fij,
    fDead,
    fLive,
    gij,
    eps138,
    eps500,
    sigma,
    beta,
    ratio,
    bulkDensity,
    gammaPrime,
    xi,
    windB: 0.02526 * Math.pow(sigma, 0.54),
    windC: 7.47 * Math.exp(-0.133 * Math.pow(sigma, 0.55)),
    windE: 0.715 * Math.exp(-3.59e-4 * sigma),
    slopeK: beta > 0 ? 5.275 * Math.pow(beta, -0.3) : 0,
    residenceMin: sigma > 0 ? 384 / sigma : 0,
    waf: p.waf ?? unshelteredWaf(p.depthM),
    burnable,
  };
}

/** No-wind, no-slope fire behaviour of a fuel bed at a given moisture. */
export interface SurfaceBase {
  bed: FuelBed;
  /** No-wind, no-slope spread rate, m/min (0 = does not spread). */
  r0: number;
  /** Reaction intensity, Btu/ft²/min (kept in US units: it feeds the wind limit and intensity). */
  reactionIntensity: number;
  /** Effective wind speed limit, ft/min. */
  windLimitFtMin: number;
  /** 1 h dead fuel moisture it was computed with (fraction); the crown fire model needs it. */
  d1: number;
  /**
   * Calibration factor already applied to r0 (fuelBases). Intensity stays physical: it is computed from
   * the unadjusted rate, so a calibrated slowdown does not make the fire look weaker to attacks and lines.
   */
  rosAdj?: number;
}

function dampingCoefficient(mf: number, mx: number): number {
  if (!(mx > 0) || mf >= mx) return 0;
  const r = mf / mx;
  return 1 - 2.59 * r + 5.11 * r * r - 3.52 * r * r * r;
}

/** No-wind, no-slope behaviour. For a dynamic model, prepare the bed with the same moisture. */
export function surfaceBase(bed: FuelBed, m: FuelMoisture): SurfaceBase {
  if (!bed.burnable)
    return { bed, r0: 0, reactionIntensity: 0, windLimitFtMin: 0, d1: m.d1 };
  // Cured herbaceous fuel takes the 1 h moisture.
  const mf = [m.d1, m.d10, m.d100, m.d1, m.liveHerb, m.liveWoody];
  const { load, fij, gij, eps138, eps500 } = bed;

  // Live moisture of extinction (Rothermel 1972 eq. 88, Albini 1976).
  let deadFactor = 0,
    deadMoist = 0,
    liveFactor = 0;
  for (let i = 0; i < LIVE_FIRST; i++) {
    deadFactor += load[i] * eps138[i];
    deadMoist += load[i] * eps138[i] * mf[i];
  }
  for (let i = LIVE_FIRST; i < N; i++) liveFactor += load[i] * eps500[i];
  let mxLive = bed.mxDead;
  if (deadFactor > 0 && liveFactor > 0) {
    const fineDeadMoist = deadMoist / deadFactor;
    mxLive = Math.max(
      bed.mxDead,
      2.9 * (deadFactor / liveFactor) * (1 - fineDeadMoist / bed.mxDead) -
        0.226,
    );
  }

  // Reaction intensity: net load × heat × moisture and mineral damping, per category.
  const etaS = Math.min(1, 0.174 * Math.pow(EFFECTIVE_MINERAL, -0.19));
  let mfDead = 0,
    mfLive = 0,
    wnDead = 0,
    wnLive = 0;
  for (let i = 0; i < N; i++) {
    const wn = gij[i] * load[i] * (1 - TOTAL_MINERAL);
    if (i < LIVE_FIRST) {
      mfDead += fij[i] * mf[i];
      wnDead += wn;
    } else {
      mfLive += fij[i] * mf[i];
      wnLive += wn;
    }
  }
  const etaMDead = dampingCoefficient(mfDead, bed.mxDead);
  const etaMLive = dampingCoefficient(mfLive, mxLive);
  const reactionIntensity =
    bed.gammaPrime * bed.heat * etaS * (wnDead * etaMDead + wnLive * etaMLive);

  // Heat sink: bulk density × effective heating number × heat of pre-ignition.
  let qDead = 0,
    qLive = 0;
  for (let i = 0; i < N; i++) {
    if (load[i] === 0) continue;
    const q = fij[i] * eps138[i] * (250 + 1116 * mf[i]);
    if (i < LIVE_FIRST) qDead += q;
    else qLive += q;
  }
  const heatSink = bed.bulkDensity * (bed.fDead * qDead + bed.fLive * qLive);
  const r0FtMin = heatSink > 0 ? (reactionIntensity * bed.xi) / heatSink : 0;
  return {
    bed,
    r0: Math.max(0, r0FtMin) * FT_TO_M,
    reactionIntensity,
    windLimitFtMin: 0.9 * reactionIntensity,
    d1: m.d1,
  };
}

/** Head fire behaviour and the ellipse that gives the spread rate in every direction. */
export interface HeadFire {
  /** Head fire spread rate, m/min. */
  ros: number;
  /** Direction of maximum spread, degrees clockwise from north. */
  headDeg: number;
  /** Length-to-breadth ratio of the fire ellipse. */
  lengthToBreadth: number;
  eccentricity: number;
  /** Effective (wind plus slope) wind speed at midflame, m/s. */
  effectiveWindMs: number;
  /** Byram's fireline intensity at the head, kW/m. */
  intensityKwM: number;
  /** Flame length at the head (Byram 1959), m. */
  flameLengthM: number;
}

/** Length-to-breadth ratio from the effective midflame wind (BehavePlus form of Anderson 1983). */
export function lengthToBreadth(effectiveWindMs: number): number {
  const mph = effectiveWindMs * MS_TO_FTMIN * FTMIN_TO_MPH;
  const lb =
    0.936 * Math.exp(0.1147 * mph) + 0.461 * Math.exp(-0.0692 * mph) - 0.397;
  return Math.min(MAX_LENGTH_TO_BREADTH, Math.max(1, lb));
}

/**
 * Combines wind and slope as vectors (Rothermel 1972; BehavePlus "direction of maximum spread").
 * midflameWindMs: wind at midflame height; windToDeg: direction the wind blows TOWARDS;
 * slopeTan: rise over run; upslopeDeg: direction of steepest ascent. Bearings clockwise from north.
 */
export function headFire(
  base: SurfaceBase,
  midflameWindMs: number,
  windToDeg: number,
  slopeTan: number,
  upslopeDeg: number,
  /**
   * Wind limit: true (or "rothermel") = Rothermel's 0.9 × reaction intensity (BehavePlus); "revised" =
   * Andrews, Cruz and Rothermel (2013), 96.8 × I_R^(1/3) ft/min, which they found less restrictive and
   * closer to observations; false = none.
   */
  useWindLimit: boolean | "rothermel" | "revised" = true,
): HeadFire {
  const { bed, r0 } = base;
  if (!(r0 > 0)) {
    return {
      ros: 0,
      headDeg: 0,
      lengthToBreadth: 1,
      eccentricity: 0,
      effectiveWindMs: 0,
      intensityKwM: 0,
      flameLengthM: 0,
    };
  }
  const { windB: b, windC: c, windE: e, ratio } = bed;
  const ratioPowE = Math.pow(ratio, e);
  const windFtMin = Math.max(0, midflameWindMs) * MS_TO_FTMIN;
  const phiW = windFtMin > 0 ? (c * Math.pow(windFtMin, b)) / ratioPowE : 0;
  const phiS = bed.slopeK * slopeTan * slopeTan;

  // Vector sum in the horizontal plane; x east, y north.
  const wr = (windToDeg * Math.PI) / 180,
    sr = (upslopeDeg * Math.PI) / 180;
  const x = phiW * Math.sin(wr) + phiS * Math.sin(sr);
  const y = phiW * Math.cos(wr) + phiS * Math.cos(sr);
  let phiE = Math.hypot(x, y);
  let headDeg = phiE > 0 ? (Math.atan2(x, y) * 180) / Math.PI : upslopeDeg;
  if (headDeg < 0) headDeg += 360;

  // Effective wind speed and Rothermel's wind limit (0.9 × reaction intensity, ft/min).
  let effFtMin = phiE > 0 ? Math.pow((phiE * ratioPowE) / c, 1 / b) : 0;
  const limitFtMin =
    useWindLimit === "revised" ? 96.8 * Math.cbrt(base.reactionIntensity) : useWindLimit ? base.windLimitFtMin : Infinity;
  if (effFtMin > limitFtMin) {
    effFtMin = limitFtMin;
    phiE = (c * Math.pow(effFtMin, b)) / ratioPowE;
  }
  const ros = r0 * (1 + phiE);
  const effectiveWindMs = effFtMin / MS_TO_FTMIN;
  const lb = lengthToBreadth(effectiveWindMs);
  const ecc = Math.sqrt(lb * lb - 1) / lb;
  // Byram intensity I = I_R × residence time × R (Btu/ft/s), flame length 0.45 I^0.46 ft.
  const intensityBtu =
    (base.reactionIntensity * bed.residenceMin * (ros * M_TO_FT)) / 60;
  const intensityKwM = intensityBtu * BTU_FT_S_TO_KW_M;
  const flameLengthM =
    intensityBtu > 0 ? 0.45 * Math.pow(intensityBtu, 0.46) * FT_TO_M : 0;
  return {
    ros,
    headDeg,
    lengthToBreadth: lb,
    eccentricity: ecc,
    effectiveWindMs,
    intensityKwM,
    flameLengthM,
  };
}

/**
 * Spread rate (m/min) in direction bearingDeg, measured from the ignition point at the rear
 * focus of the ellipse: R(θ) = R_head (1 − e) / (1 − e cos θ), θ the angle from the head.
 */
export function ellipseRate(
  ros: number,
  headDeg: number,
  eccentricity: number,
  bearingDeg: number,
): number {
  const cos = Math.cos(((bearingDeg - headDeg) * Math.PI) / 180);
  return (ros * (1 - eccentricity)) / (1 - eccentricity * cos);
}

/** Flame length (m) from fireline intensity (kW/m), Byram (1959). */
export function flameLength(intensityKwM: number): number {
  return intensityKwM > 0 ? 0.0775 * Math.pow(intensityKwM, 0.46) : 0;
}

/** Midflame wind (m/s) from the 10-m open wind of a forecast or station. */
export function midflameWind(wind10mMs: number, bed: FuelBed): number {
  return wind10mMs * WIND_20FT_PER_10M * bed.waf;
}
