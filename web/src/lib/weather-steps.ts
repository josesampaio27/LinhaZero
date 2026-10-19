// Hourly weather steps from a weather snapshot (GET /api/v1/weather). The current moisture is in conditions.ts.
import { fuelMoistureFromWeather, isDaylight, type FuelMoisture, type WeatherStep, type Wind } from "@linha-zero/engine";
import type { WeatherResponse } from "../api/client";

/** The moment the snapshot describes: when its wind was observed or modelled. */
export function snapshotTime(s: WeatherResponse): Date {
  const v = s.use === "observed" ? s.observed : s.model;
  return new Date(v?.observedAt ?? Date.now());
}

/**
 * Weather steps that follow the forecast: from minute 0 the given wind (the sliders) and moisture,
 * then one step per forecast hour within the duration, with the forecast wind and, when withMoisture,
 * the fuel moisture of that hour (falling back to the current air when the hour lacks it).
 */
export function forecastSteps(s: WeatherResponse, wind: Wind, moisture: FuelMoisture | undefined, durationMin: number, withMoisture: boolean): WeatherStep[] {
  const start = snapshotTime(s).getTime();
  const steps: WeatherStep[] = [{ fromMin: 0, wind, ...(withMoisture && moisture && { moisture }) }];
  for (const f of s.forecast) {
    const fromMin = Math.round((new Date(f.time).getTime() - start) / 60_000);
    if (fromMin <= steps[steps.length - 1].fromMin || fromMin >= durationMin) continue;
    const step: WeatherStep = { fromMin, wind: { directionDeg: Math.round(f.directionDeg) % 360, speedMs: Math.round(f.speedMs * 10) / 10 } };
    if (withMoisture) {
      const tempC = f.temperatureC ?? s.air?.temperatureC ?? s.model?.temperatureC ?? null;
      const rhPct = f.humidityPct ?? s.air?.humidityPct ?? s.model?.humidityPct ?? null;
      if (tempC !== null && rhPct !== null) {
        const at = new Date(f.time);
        step.moisture = fuelMoistureFromWeather(
          { tempC, rhPct, cloudPct: f.cloudPct ?? undefined, daylight: isDaylight(at, s.location.lat, s.location.lon) },
          at.getUTCMonth() + 1,
        );
      } else if (moisture) step.moisture = moisture;
    }
    steps.push(step);
  }
  return steps;
}
