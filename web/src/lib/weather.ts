import type { LngLat } from "./projection";
import type { WeatherProvenance, Wind } from "@linha-zero/engine";
import type { IncidentsResponse, WeatherResponse } from "../api/client";
import { ApiError, ApiUnreachable, incidentsApi, weatherApi } from "./api";

export const UNAVAILABLE =
  "Serviço de meteorologia indisponível. Está a correr? `npm run up`. Os valores à mão continuam a funcionar.";

/** The service is down or not the API: "indisponível". An error from the API carries its own message. */
async function weatherCall<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (e) {
    if (e instanceof ApiError) throw new Error(`Serviço de meteorologia: ${e.message}`);
    if (e instanceof ApiUnreachable) throw new Error(UNAVAILABLE);
    throw e;
  }
}

/** The error of a weather call without a session (the demo, or not signed in): not a failure, live weather needs a login. */
export const SIGNED_OUT = "Tempo em direto só com sessão iniciada.";

export function fetchWeather(lat: number, lon: number): Promise<WeatherResponse> {
  return weatherCall(
    weatherApi.get(lat, lon).catch((e: unknown) => {
      throw e instanceof ApiError && e.status === 401 ? new Error(SIGNED_OUT) : e;
    }),
  );
}

export function fetchIncidents([[minLon, minLat], [maxLon, maxLat]]: [LngLat, LngLat]): Promise<IncidentsResponse> {
  return weatherCall(incidentsApi.active(`${minLon},${minLat},${maxLon},${maxLat}`));
}

/** The slider values for a snapshot. Calm keeps the current direction; speed is snapped to the slider's 0.5 steps and range. */
export function toWind(s: WeatherResponse, current: Wind): Wind {
  const v = s.use === "observed" ? s.observed! : s.model!;
  const directionDeg = v.directionDeg === null ? current.directionDeg : Math.round(v.directionDeg) % 360;
  const speedMs = Math.min(20, Math.max(0, Math.round(v.speedMs * 2) / 2));
  return { directionDeg, speedMs };
}

/** Provenance kept in a saved scenario. */
export function provenanceOf(s: WeatherResponse): WeatherProvenance {
  const src = s.sources.find((x) => x.name === s.windSource);
  return s.use === "observed"
    ? { source: "ipma", station: s.observed!.station.name, observedAt: s.observed!.observedAt, fetchedAt: src?.fetchedAt ?? "" }
    : { source: "open-meteo", observedAt: s.model!.observedAt, fetchedAt: src?.fetchedAt ?? "" };
}

const LISBON = "Europe/Lisbon";

/** "12:00" in Portuguese local time. */
export function hourMinute(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-PT", { timeZone: LISBON, hour: "2-digit", minute: "2-digit" });
}

/** "17/10 12:00" in Portuguese local time. */
export function dayHour(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-PT", { timeZone: LISBON, day: "2-digit", month: "2-digit" })} ${hourMinute(iso)}`;
}

/** "há 1 h 25 min", "há 3 dias": the age shown to the user is always against the real clock, so old data looks old. */
export function ageText(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  if (min < 48 * 60) return `há ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
  return `há ${Math.round(min / 1440)} dias`;
}
