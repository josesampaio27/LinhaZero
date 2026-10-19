// Crown fire for forest fuels (Rothermel model). A surface fire climbs into the canopy when its
// intensity reaches Van Wagner's (1977) critical value; the crown fire then spreads at Cruz et al.'s
// (2005) rate, actively (whole canopy) or passively (torching trees), whichever criterion holds.
//
// Van Wagner, C.E. (1977). Conditions for the start and spread of crown fire. Can. J. For. Res. 7.
// Cruz, M.G., Alexander, M.E., Wakimoto, R.H. (2005). Development and testing of models for predicting
//   crown fire rate of spread in conifer forest stands. Can. J. For. Res. 35: 1626–1639.
import type { CanopyFuel } from "./rothermel";

/** Foliar moisture content, %: the usual summer value for Mediterranean conifers and eucalypts. */
export const FOLIAR_MOISTURE_PCT = 100;

/** Heat content of canopy fuel, kJ/kg. */
const CANOPY_HEAT_KJ_KG = 18_000;

/** Van Wagner's critical surface fire intensity (kW/m) for crown ignition. */
export function criticalSurfaceIntensity(cbhM: number, foliarMoisturePct = FOLIAR_MOISTURE_PCT): number {
  return (0.01 * cbhM * (460 + 25.9 * foliarMoisturePct)) ** 1.5;
}

/** Cruz et al. (2005) active crown fire rate (m/min): 10 m open wind in km/h, fine dead moisture in %. */
export function activeCrownRate(wind10mKmh: number, cbdKgM3: number, fineDeadMoisturePct: number): number {
  return 11.02 * Math.max(0, wind10mKmh) ** 0.9 * cbdKgM3 ** 0.19 * Math.exp(-0.17 * fineDeadMoisturePct);
}

export interface CrownFire {
  /** "passive" (torching, crown fraction < 1) or "active" (continuous crown fire). */
  kind: "passive" | "active";
  /** Crown fire rate of spread, m/min. */
  rate: number;
  /** Fraction of the canopy fuel consumed (1 for an active crown fire). */
  crownFraction: number;
  /** Byram intensity per unit of rate added by the canopy fuel, kW/m per m/min. */
  extraIntensityPerRate: number;
}

/**
 * The crown fire a surface fire of this intensity starts, or null when it stays on the surface.
 * Active when the criterion CAC = R_a / (3 / CBD) reaches 1 (Van Wagner's critical mass flow of
 * 3 kg/m²/min); otherwise passive at R_a · e^(−CAC) (Cruz et al. 2005).
 */
export function crownFire(
  canopy: CanopyFuel,
  surfaceIntensityKwM: number,
  wind10mKmh: number,
  fineDeadMoisturePct: number,
  rateAdj = 1,
): CrownFire | null {
  if (!(surfaceIntensityKwM >= criticalSurfaceIntensity(canopy.cbhM))) return null;
  // Whether the crown fire is active is decided on Cruz's rate itself; rateAdj (calibration) only
  // scales how fast it spreads.
  const ra = activeCrownRate(wind10mKmh, canopy.cbdKgM3, fineDeadMoisturePct);
  const cac = ra / (3 / canopy.cbdKgM3);
  const active = cac >= 1;
  const crownFraction = active ? 1 : cac;
  return {
    kind: active ? "active" : "passive",
    rate: (active ? ra : ra * Math.exp(-cac)) * rateAdj,
    crownFraction,
    extraIntensityPerRate: (crownFraction * canopy.cflKgM2 * CANOPY_HEAT_KJ_KG) / 60,
  };
}
