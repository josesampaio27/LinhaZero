// Fuel moisture from the weather, for the Rothermel model.
//
// Dead fuel: the 1978 US National Fire-Danger Rating System without fuel moisture sticks, as
// documented in Cohen and Deeming (1985, PSW-GTR-82, pp. 1–4):
//   - equilibrium moisture content (EMC) from temperature and relative humidity (Simard 1968);
//   - temperature and humidity at the fuel surface corrected for sunshine by the state of weather;
//   - 1 h = 1.03 × EMC at the fuel surface, 10 h = 1.28 × EMC at the fuel surface.
// It needs no history, which suits a what-if tool. 100 h fuels respond over days; without that
// history they are taken as 10 h plus 2 points (PROVISÓRIO).
//
// Live fuel: a seasonal table by month (PROVISÓRIO) until satellite live fuel moisture is used.
import type { FuelMoisture } from "./rothermel";

/** Equilibrium moisture content (fraction) of dead wood, Simard (1968). tempF in °F, rhPct in %. */
export function equilibriumMoisture(tempF: number, rhPct: number): number {
  const rh = Math.min(100, Math.max(0, rhPct));
  let emc: number;
  if (rh < 10) emc = 0.03229 + 0.281073 * rh - 0.000578 * tempF * rh;
  else if (rh < 50) emc = 2.22749 + 0.160107 * rh - 0.014784 * tempF;
  else
    emc = 21.0606 + 0.005565 * rh * rh - 0.00035 * rh * tempF - 0.483199 * rh;
  return Math.max(0, emc) / 100;
}

/**
 * NFDRS state of weather from cloud cover: 0 clear (< 10%), 1 scattered (10–50%), 2 broken
 * (50–90%), 3 overcast (> 90%).
 */
export function stateOfWeather(cloudPct: number): 0 | 1 | 2 | 3 {
  if (cloudPct < 10) return 0;
  if (cloudPct <= 50) return 1;
  if (cloudPct <= 90) return 2;
  return 3;
}

/** NFDRS corrections from instrument height to the fuel surface: [°F added, RH multiplier]. */
const SUN_CORRECTION: Record<0 | 1 | 2 | 3, [number, number]> = {
  0: [25, 0.75],
  1: [19, 0.83],
  2: [12, 0.92],
  3: [5, 1.0],
};

export interface AirConditions {
  /** Air temperature at instrument height, °C. */
  tempC: number;
  /** Relative humidity, %. */
  rhPct: number;
  /** Cloud cover, %; omitted = clear sky (the driest case). */
  cloudPct?: number;
  /** Whether the sun is up; at night there is no sunshine correction. Omitted = day. */
  daylight?: boolean;
}

/** Dead fuel moisture (fractions) for fuels exposed to the sun, from the air at instrument height. */
export function deadFuelMoisture(
  air: AirConditions,
): Pick<FuelMoisture, "d1" | "d10" | "d100"> {
  const tempF = air.tempC * 1.8 + 32;
  const [addF, rhFactor] =
    air.daylight === false
      ? [0, 1]
      : SUN_CORRECTION[stateOfWeather(air.cloudPct ?? 0)];
  const emc = equilibriumMoisture(tempF + addF, air.rhPct * rhFactor);
  const d1 = 1.03 * emc;
  const d10 = 1.28 * emc;
  return { d1, d10, d100: d10 + 0.02 };
}

/**
 * Live herbaceous and woody moisture (fractions) by month, January first. PROVISÓRIO: a typical
 * seasonal curve of north-western Portuguese shrublands (grass cures in late summer, shrubs fall to
 * about 80%); to be replaced by satellite live fuel moisture.
 */
export const LIVE_MOISTURE_BY_MONTH: readonly {
  liveHerb: number;
  liveWoody: number;
}[] = [
  { liveHerb: 1.5, liveWoody: 1.2 },
  { liveHerb: 1.5, liveWoody: 1.2 },
  { liveHerb: 1.5, liveWoody: 1.3 },
  { liveHerb: 1.4, liveWoody: 1.3 },
  { liveHerb: 1.1, liveWoody: 1.2 },
  { liveHerb: 0.8, liveWoody: 1.1 },
  { liveHerb: 0.5, liveWoody: 0.95 },
  { liveHerb: 0.3, liveWoody: 0.85 },
  { liveHerb: 0.3, liveWoody: 0.8 },
  { liveHerb: 0.6, liveWoody: 0.9 },
  { liveHerb: 1.0, liveWoody: 1.05 },
  { liveHerb: 1.3, liveWoody: 1.15 },
];

/** Fuel moisture from the weather and the month (1–12). */
export function fuelMoistureFromWeather(
  air: AirConditions,
  month: number,
): FuelMoisture {
  const live =
    LIVE_MOISTURE_BY_MONTH[Math.min(12, Math.max(1, Math.round(month))) - 1];
  return { ...deadFuelMoisture(air), ...live };
}

/** Whether the sun is above the horizon (solar declination and hour angle; good to a few minutes). */
export function isDaylight(at: Date, lat: number, lon: number): boolean {
  const start = Date.UTC(at.getUTCFullYear(), 0, 0);
  const day = Math.floor((at.getTime() - start) / 86_400_000);
  const rad = Math.PI / 180;
  const declination = 23.44 * Math.sin(((360 / 365) * (284 + day)) * rad);
  const solarHours = at.getUTCHours() + at.getUTCMinutes() / 60 + lon / 15;
  const hourAngle = 15 * (solarHours - 12);
  const sinElevation =
    Math.sin(lat * rad) * Math.sin(declination * rad) + Math.cos(lat * rad) * Math.cos(declination * rad) * Math.cos(hourAngle * rad);
  return sinElevation > 0;
}

/**
 * One hour of the Canadian Fine Fuel Moisture Code (Van Wagner 1977, hourly FFMC; as in the cffdrs
 * `hffmc`): wetting by the hour's rain, then drying or wetting towards equilibrium. Air at 2 m, wind at
 * 10 m in km/h, rain in mm. Start a series at 85 (the standard start-up value) a few days ahead.
 */
export function hourlyFfmc(
  prev: number,
  w: { tempC: number; rhPct: number; windKmh: number; rainMm: number },
): number {
  const rh = Math.min(100, Math.max(0, w.rhPct));
  const t = w.tempC;
  let mo = (147.27723 * (101 - prev)) / (59.5 + prev);
  if (w.rainMm > 0) {
    const r = w.rainMm;
    mo +=
      mo <= 150
        ? 42.5 * r * Math.exp(-100 / (251 - mo)) * (1 - Math.exp(-6.93 / r))
        : 42.5 * r * Math.exp(-100 / (251 - mo)) * (1 - Math.exp(-6.93 / r)) +
          0.0015 * (mo - 150) ** 2 * Math.sqrt(r);
    mo = Math.min(mo, 250);
  }
  const tail = 0.18 * (21.1 - t) * (1 - Math.exp(-0.115 * rh));
  const ed = 0.942 * rh ** 0.679 + 11 * Math.exp((rh - 100) / 10) + tail;
  const ew = 0.618 * rh ** 0.753 + 10 * Math.exp((rh - 100) / 10) + tail;
  const rate = (a: number) =>
    (0.424 * (1 - a ** 1.7) + 0.0694 * Math.sqrt(w.windKmh) * (1 - a ** 8)) * 0.0579 * Math.exp(0.0365 * t);
  let m = mo;
  if (mo > ed) m = ed + (mo - ed) * 10 ** -rate(rh / 100);
  else if (mo < ew) m = ew - (ew - mo) * 10 ** -rate((100 - rh) / 100);
  return Math.min(101, Math.max(0, (59.5 * (250 - m)) / (147.27723 + m)));
}

/**
 * Dead fuel moisture (fractions) from an FFMC value: 1 h = the FFMC moisture content (litter-like fine
 * fuel), 10 h and 100 h in the same ratios as the NFDRS model (deadFuelMoisture), at least 2%.
 */
export function deadFuelMoistureFromFfmc(ffmc: number): Pick<FuelMoisture, "d1" | "d10" | "d100"> {
  const d1 = Math.max(0.02, (147.27723 * (101 - ffmc)) / (59.5 + ffmc) / 100);
  const d10 = (d1 * 1.28) / 1.03;
  return { d1, d10, d100: d10 + 0.02 };
}
