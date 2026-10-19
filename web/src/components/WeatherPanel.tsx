import { useState } from "react";
import type { GridData, ProjectedPoint, Wind } from "@linha-zero/engine";
import { gridToLngLat, projectedToLngLat } from "../lib/projection";
import {
  ageText,
  dayHour,
  fetchWeather,
  hourMinute,
  provenanceOf,
  sameWind,
  toWind,
  type AppliedWeather,
} from "../lib/weather";
import type { WeatherResponse } from "../api/client";
import { compassName } from "./WindControl";

interface Props {
  grid: GridData | null;
  ignition: ProjectedPoint | null; // EPSG:3763
  wind: Wind;
  applied: AppliedWeather | null;
  onApply: (a: AppliedWeather) => void;
}

/** Wind speeds are shown in km/h, as on the wind control. */
const kmh = (ms: number) => Math.round(ms * 3.6);

const WARNING_LEVEL: Record<string, string> = { yellow: "amarelo", orange: "laranja", red: "vermelho" };

/** "Usar o tempo de agora": fills the wind from the ingest service and shows where the numbers came from. */
export function WeatherPanel({ grid, ignition, wind, applied, onApply }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    if (!grid) return;
    const h = grid.header;
    const [lon, lat] = ignition ? projectedToLngLat(ignition[0], ignition[1]) : gridToLngLat(h, h.cols / 2, h.rows / 2);
    setLoading(true);
    setError(null);
    try {
      const snapshot = await fetchWeather(lat, lon);
      onApply({ wind: toWind(snapshot, wind), weather: provenanceOf(snapshot), snapshot, at: ignition ? "ignition" : "centre" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const unchanged = applied !== null && sameWind(wind, applied.wind);

  return (
    <div className="weather">
      <button disabled={loading || !grid} onClick={() => void apply()}>
        {loading ? "A obter o tempo…" : "Usar o tempo de agora"}
      </button>
      {error && <p className="message">{error}</p>}
      {applied?.snapshot && <Card s={applied.snapshot} at={applied.at} adjusted={!unchanged} />}
      {applied && !applied.snapshot && applied.weather && unchanged && (
        <p className="hint">
          {applied.weather.source === "ipma"
            ? `Vento do IPMA, ${applied.weather.station}, ${dayHour(applied.weather.observedAt)}`
            : `Vento do modelo Open-Meteo, ${dayHour(applied.weather.observedAt)}`}
        </p>
      )}
      <p className="hint">Dados: IPMA · Open-Meteo · fogos.pt (VOST Portugal)</p>
    </div>
  );
}

function Card({ s, at, adjusted }: { s: WeatherResponse; at?: "ignition" | "centre"; adjusted: boolean }) {
  const chosen = s.use === "observed" ? s.observed! : s.model!;
  const other = s.use === "observed" ? s.model : s.observed;
  // Humidity and temperature from the nearest station, often closer than the wind's; the model's when no station has them.
  const air = s.air ?? { humidityPct: s.model?.humidityPct ?? null, temperatureC: s.model?.temperatureC ?? null };
  const windStale = s.sources.find((x) => x.name === s.windSource)?.stale;
  const failed = (name: string) => s.sources.some((x) => x.name === name && x.error && !x.fetchedAt);
  const windText = (v: { directionDeg: number | null; speedMs: number }) =>
    v.directionDeg === null ? `${kmh(v.speedMs)} km/h (calmo)` : `${kmh(v.speedMs)} km/h de ${compassName(v.directionDeg)}`;

  return (
    <div className="weather-card">
      <p>
        <strong>
          {s.use === "observed"
            ? `IPMA · ${s.observed!.station.name} (${Math.round(s.observed!.station.distanceKm)} km)`
            : "Modelo Open-Meteo"}
        </strong>{" "}
        · {hourMinute(chosen.observedAt)} ({ageText(chosen.observedAt)}) · {at === "ignition" ? "no ponto de ignição" : "no centro da zona"}
        {adjusted && " · ajustado à mão"}
      </p>
      {windStale && <p className="warn-text">Vento de {ageText(chosen.observedAt)} (sem ligação)</p>}
      {other && (
        <p className="hint">
          {s.use === "observed" ? "Modelo" : `IPMA ${s.observed!.station.name}`}: {windText(other)}
        </p>
      )}
      <p>
        {air.humidityPct !== null && `Humidade ${Math.round(air.humidityPct)}%`}
        {air.humidityPct !== null && air.temperatureC !== null && " · "}
        {air.temperatureC !== null && `${Math.round(air.temperatureC)} °C`}
        {s.air && (air.humidityPct !== null || air.temperatureC !== null) && (
          <span className="hint">
            {" "}
            (IPMA {s.air.station.name}, {Math.round(s.air.station.distanceKm)} km, {hourMinute(s.air.observedAt)})
          </span>
        )}
      </p>
      {s.fireRisk ? (
        <p>
          Risco de incêndio: <span className={`risk risk-${s.fireRisk.level}`}>{s.fireRisk.label}</span>
        </p>
      ) : (
        failed("IPMA risco de incêndio") && <p className="hint">Risco de incêndio indisponível</p>
      )}
      {s.warnings.length > 0 && (
        <p className="row">
          {s.warnings.map((w, i) => (
            <span key={i} className={`chip chip-${w.level}`} title={w.text}>
              Aviso {WARNING_LEVEL[w.level] ?? w.level}: {w.type}
            </span>
          ))}
        </p>
      )}
      {failed("IPMA avisos") && <p className="hint">Avisos indisponíveis</p>}
      {s.forecast.length > 0 && (
        <p className="hint">
          Próximas horas: {s.forecast.map((f) => `${hourMinute(f.time).slice(0, 2)}h ${compassName(f.directionDeg)} ${kmh(f.speedMs)} km/h`).join(" · ")}
        </p>
      )}
    </div>
  );
}
