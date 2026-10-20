// Spread model parameters. Dimensionless unless stated.

/** Wind coefficient in windFactor = exp(kWind * U * cos(theta)), with U in m/s. */
export const K_WIND = 0.15; // PROVISÓRIO: calibrar contra incêndio real

/** Slope coefficient in slopeFactor = exp(kSlope * tan(phi)). */
export const K_SLOPE = 3.0; // PROVISÓRIO: calibrar contra incêndio real

/** Lower bound for slopeFactor when the fire spreads downhill. */
export const MIN_SLOPE_FACTOR = 0.5; // PROVISÓRIO: calibrar contra incêndio real

/** Rate factor applied by the "Ataque" (suppression) tool in the UI. */
export const DEFAULT_SUPPRESSION_FACTOR = 0.2;

/** Rate factor applied by the "Proteger zona" tool in the UI. */
export const DEFAULT_PROTECT_FACTOR = 0.1;

// Rothermel model only: interventions against an intense fire.

/** Fireline intensity (kW/m) up to which "Ataque" and "Proteger zona" keep their full effect (hand tools). */
export const ATTACK_FULL_KWM = 500;

/** Fireline intensity (kW/m) from which ground crews have no effect (uncontrollable); linear in between. */
export const ATTACK_NONE_KWM = 4000;

/** Width (m) of a drawn containment line when it does not set its own: a line cut by machinery. */
export const DEFAULT_LINE_WIDTH_M = 4; // PROVISÓRIO

/** A line or road holds with 50% probability when its width equals this many flame lengths. */
export const HOLD_WIDTH_PER_FLAME = 1; // PROVISÓRIO: calibrar

/** Steepness of the hold probability against width / flame length (logistic). */
export const HOLD_STEEPNESS = 3; // PROVISÓRIO: calibrar

/** Fireline intensity (kW/m) below which a burning cell launches no embers (ELMFIRE's sample value). */
export const SPOT_CRITICAL_KWM = 2000;

/** Probability that a hectare burning above SPOT_CRITICAL_KWM starts a spot fire (ELMFIRE sample: 1% of 30 m cells). */
export const SPOT_PER_HA = 0.1; // PROVISÓRIO: calibrar

/** Minutes between an ember landing and its spot fire spreading. */
export const SPOT_DELAY_MIN = 2; // PROVISÓRIO

/** Rothermel calibration: multiplier of every fuel's spread rate (and so of its intensity). */
export const ROS_ADJ = 1;

/** Rothermel calibration: multiplier of the midflame wind (wind adjustment factor and weather bias together). */
export const WIND_ADJ = 1;

/**
 * Rothermel calibration: points of moisture (fraction, 0.01 = 1 point) added to the dead fuel moisture
 * (1 h, 10 h, 100 h) computed from the weather. Absorbs the bias of the moisture model and the weather data.
 */
export const DEAD_MOISTURE_OFFSET = 0;

/** The coefficients above as one simulation input, so a grid variant can override them. */
export interface ModelParams {
  kWind: number;
  kSlope: number;
  minSlopeFactor: number;
  suppressionFactor: number;
  protectFactor: number;
  attackFullKwM: number;
  attackNoneKwM: number;
  lineWidthM: number;
  holdWidthPerFlame: number;
  holdSteepness: number;
  spotCriticalKwM: number;
  spotPerHa: number;
  spotDelayMin: number;
  rosAdj: number;
  windAdj: number;
  /** Rothermel calibration: spread factor per fuel group, on top of rosAdj (FuelParams.group). */
  rosAdjLitter: number;
  rosAdjUnderstory: number;
  rosAdjShrub: number;
  rosAdjGrass: number;
  deadMoistureOffset: number;
  /** Rothermel: crown fire in forest fuels (1 on, 0 off; crown.ts) and a multiplier of its rate. */
  crownFire: number;
  crownAdj: number;
  /**
   * Share of the gust added to the mean 10 m wind (0 = mean only): wind = mean + gustShare × (gust − mean).
   * Fast runs follow gusts that hourly means smooth out. Only where the weather has gusts.
   */
  gustShare: number;
  /** Rothermel's wind limit: 1 = original (0.9 I_R), 2 = Andrews et al. 2013 revised, 0 = none. */
  windLimit: number;
  /**
   * Crown ratio of the trees in the sheltered wind adjustment factor (BehavePlus: crown fill = cover ×
   * crown ratio / 3). 1 = crowns as deep as the trees are tall (the engine's original choice).
   */
  crownRatio: number;
  /**
   * Half-width (m) of a box filter on the elevation before the slope is computed; 0 = none. The DEM
   * (Copernicus GLO-30) is a surface model: tree and building edges add slope that is not terrain.
   */
  demSmoothM: number;
}

export const DEFAULT_PARAMS: ModelParams = {
  kWind: K_WIND,
  kSlope: K_SLOPE,
  minSlopeFactor: MIN_SLOPE_FACTOR,
  suppressionFactor: DEFAULT_SUPPRESSION_FACTOR,
  protectFactor: DEFAULT_PROTECT_FACTOR,
  attackFullKwM: ATTACK_FULL_KWM,
  attackNoneKwM: ATTACK_NONE_KWM,
  lineWidthM: DEFAULT_LINE_WIDTH_M,
  holdWidthPerFlame: HOLD_WIDTH_PER_FLAME,
  holdSteepness: HOLD_STEEPNESS,
  spotCriticalKwM: SPOT_CRITICAL_KWM,
  spotPerHa: SPOT_PER_HA,
  spotDelayMin: SPOT_DELAY_MIN,
  rosAdj: ROS_ADJ,
  windAdj: WIND_ADJ,
  rosAdjLitter: 1,
  rosAdjUnderstory: 1,
  rosAdjShrub: 1,
  rosAdjGrass: 1,
  deadMoistureOffset: DEAD_MOISTURE_OFFSET,
  crownFire: 0,
  crownAdj: 1,
  gustShare: 0,
  windLimit: 1,
  crownRatio: 1,
  demSmoothM: 0,
};

/** The spread factor of a fuel group (no group: rosAdj alone). */
export function groupRosAdj(
  p: Pick<ModelParams, "rosAdj" | "rosAdjLitter" | "rosAdjUnderstory" | "rosAdjShrub" | "rosAdjGrass">,
  group: "F" | "M" | "V" | "H" | undefined,
): number {
  const g =
    group === "F"
      ? p.rosAdjLitter
      : group === "M"
        ? p.rosAdjUnderstory
        : group === "V"
          ? p.rosAdjShrub
          : group === "H"
            ? p.rosAdjGrass
            : 1;
  return p.rosAdj * g;
}

/** Share of an intervention's effect that remains against a fire of this intensity (1 = full, 0 = none). */
export function attackEffectiveness(intensityKwM: number, p: Pick<ModelParams, "attackFullKwM" | "attackNoneKwM">): number {
  if (intensityKwM <= p.attackFullKwM) return 1;
  if (intensityKwM >= p.attackNoneKwM) return 0;
  return (p.attackNoneKwM - intensityKwM) / (p.attackNoneKwM - p.attackFullKwM);
}

/** Probability that a line or road of this width (m) stops flames of this length (m). */
export function holdProbability(widthM: number, flameLengthM: number, p: Pick<ModelParams, "holdWidthPerFlame" | "holdSteepness">): number {
  if (!(flameLengthM > 0)) return 1;
  return 1 / (1 + Math.exp(-p.holdSteepness * (widthM / flameLengthM - p.holdWidthPerFlame)));
}

/** Allowed range of each coefficient, inclusive; values outside are rejected when a variant is read. */
export const PARAM_RANGES: Record<keyof ModelParams, [number, number]> = {
  kWind: [0, 1],
  kSlope: [0, 10],
  minSlopeFactor: [0.01, 1],
  suppressionFactor: [0, 1],
  protectFactor: [0, 1],
  attackFullKwM: [0, 20000],
  attackNoneKwM: [1, 50000],
  lineWidthM: [0.5, 100],
  holdWidthPerFlame: [0.1, 10],
  holdSteepness: [0.1, 20],
  spotCriticalKwM: [0, 100000],
  spotPerHa: [0, 1],
  spotDelayMin: [0, 120],
  rosAdj: [0.1, 10],
  windAdj: [0.1, 5],
  rosAdjLitter: [0.05, 10],
  rosAdjUnderstory: [0.05, 10],
  rosAdjShrub: [0.05, 10],
  rosAdjGrass: [0.05, 10],
  deadMoistureOffset: [-0.05, 0.05],
  crownFire: [0, 1],
  crownAdj: [0.1, 5],
  gustShare: [0, 1],
  windLimit: [0, 2],
  crownRatio: [0.1, 1],
  demSmoothM: [0, 500],
};
