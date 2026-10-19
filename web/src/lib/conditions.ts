// The current conditions that feed a simulation: wind, air and fuel moisture. Each value comes from the live
// weather (GET /api/v1/weather), a scenario file or a default, and any of them can be overridden by hand.
import { DEFAULT_MOISTURE, fuelMoistureFromWeather, isDaylight, type FuelMoisture, type Wind } from "@linha-zero/engine";
import type { WeatherResponse } from "../api/client";
import { DRYNESS, drynessOf, type DrynessId } from "./moisture";
import { toWind } from "./weather";

/** The air at instrument height. Cloud cover null = unknown, treated as clear sky (the driest case). */
export interface Air {
  tempC: number;
  rhPct: number;
  cloudPct: number | null;
}

/** "tempo": fuel moisture from the air; a dryness preset; or values typed in. */
export type MoistureMode = "tempo" | DrynessId | "manual";

export interface Conditions {
  wind: Wind;
  /** Null when no source gave the air (no live data, or a scenario file, which does not store it). */
  air: Air | null;
  moistureMode: MoistureMode;
  /** The values used in "manual" mode. */
  manualMoisture: FuelMoisture;
}

/** The values a person can override. A manual field keeps its value when new live data arrives. */
export type Field = "direction" | "speed" | "temp" | "rh" | "cloud" | "moisture";

/** Where the dryness of the air is computed: the moment and place the weather describes. */
export interface Place {
  lat: number;
  lon: number;
  at: Date;
}

/** Wind speed limits of the sliders and of the API (POST /runs accepts 0–20 m/s). */
export const MAX_SPEED_MS = 20;
export const MAX_SPEED_KMH = Math.round(MAX_SPEED_MS * 3.6);

/** Filled in when someone types one air value while no source gave the air: a dry summer afternoon. */
export const DEFAULT_AIR: Air = { tempC: 28, rhPct: 30, cloudPct: 0 };

export const DEFAULT_CONDITIONS: Conditions = {
  wind: { directionDeg: 225, speedMs: 6 },
  air: null,
  moistureMode: "normal",
  manualMoisture: DEFAULT_MOISTURE,
};

export const kmhToMs = (kmh: number) => Math.min(MAX_SPEED_MS, Math.max(0, Math.round((kmh / 3.6) * 10) / 10));
export const msToKmh = (ms: number) => Math.round(ms * 3.6);
export const pctToFraction = (pct: number) => Math.round(pct * 10) / 1000;
export const fractionToPct = (f: number) => Math.round(f * 1000) / 10;

/** The air of a snapshot: the nearest station's humidity and temperature, else the model's; cloud cover from the model. */
export function airOf(s: WeatherResponse): Air | null {
  const tempC = s.air?.temperatureC ?? s.model?.temperatureC ?? null;
  const rhPct = s.air?.humidityPct ?? s.model?.humidityPct ?? null;
  if (tempC === null || rhPct === null) return null;
  return { tempC: Math.round(tempC * 10) / 10, rhPct: Math.round(rhPct), cloudPct: s.model?.cloudPct ?? null };
}

/** The moment and place a snapshot describes: when its wind was observed or modelled. */
export function placeOf(s: WeatherResponse): Place {
  const v = s.use === "observed" ? s.observed : s.model;
  return { lat: s.location.lat, lon: s.location.lon, at: new Date(v?.observedAt ?? Date.now()) };
}

/** Fuel moisture from the air: dead fuel from the air, the sun and the clouds; live fuel by month. */
export function moistureFromAir(air: Air, place: Place): FuelMoisture {
  return fuelMoistureFromWeather(
    { tempC: air.tempC, rhPct: air.rhPct, cloudPct: air.cloudPct ?? undefined, daylight: isDaylight(place.at, place.lat, place.lon) },
    place.at.getUTCMonth() + 1,
  );
}

/** The fuel moisture a simulation uses. "tempo" without air (or without a place) falls back to the default. */
export function effectiveMoisture(c: Conditions, place: Place | null): FuelMoisture {
  if (c.moistureMode === "manual") return c.manualMoisture;
  if (c.moistureMode === "tempo") return c.air && place ? moistureFromAir(c.air, place) : DEFAULT_MOISTURE;
  return DRYNESS.find((p) => p.id === c.moistureMode)!.moisture;
}

/**
 * Values typed by hand, laid over the source's values. A field with an override keeps it when new live data
 * arrives; removing the override shows the source's value again.
 */
export interface Overrides {
  direction?: number;
  speed?: number;
  temp?: number;
  rh?: number;
  cloud?: number;
  moisture?: { mode: MoistureMode; values: FuelMoisture };
}

export const manualFields = (o: Overrides) => Object.keys(o) as Field[];

/** The source's values from a live snapshot. Calm keeps the previous direction; moisture follows the air when there is one. */
export function liveBase(s: WeatherResponse, previous: Conditions): Conditions {
  const air = airOf(s);
  return { ...previous, wind: toWind(s, previous.wind), air, moistureMode: air ? "tempo" : previous.moistureMode };
}

/** The conditions a simulation uses: the source's values with the hand-typed ones on top. */
export function applyOverrides(base: Conditions, o: Overrides): Conditions {
  const wind = { directionDeg: o.direction ?? base.wind.directionDeg, speedMs: o.speed ?? base.wind.speedMs };
  const airTyped = o.temp !== undefined || o.rh !== undefined || o.cloud !== undefined;
  const from = base.air ?? DEFAULT_AIR;
  const air = airTyped ? { tempC: o.temp ?? from.tempC, rhPct: o.rh ?? from.rhPct, cloudPct: o.cloud ?? from.cloudPct } : base.air;
  return o.moisture
    ? { wind, air, moistureMode: o.moisture.mode, manualMoisture: o.moisture.values }
    : { ...base, wind, air };
}

/** A number typed in one field, clamped to what the field allows (the API takes 0–20 m/s). */
export function clampField(field: Exclude<Field, "moisture">, value: number): number {
  switch (field) {
    case "direction":
      return ((Math.round(value) % 360) + 360) % 360;
    case "speed":
      return Math.min(MAX_SPEED_MS, Math.max(0, value));
    case "temp":
      return Math.min(50, Math.max(-20, value));
    case "rh":
      return Math.min(100, Math.max(1, value));
    case "cloud":
      return Math.min(100, Math.max(0, value));
  }
}

/** The mode a scenario's moisture shows as: its preset when it matches one, else its values typed in. */
export function moistureModeOf(m: FuelMoisture): { moistureMode: MoistureMode; manualMoisture: FuelMoisture } {
  return { moistureMode: drynessOf(m) ?? "manual", manualMoisture: m };
}
