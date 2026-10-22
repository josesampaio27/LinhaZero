import { useState } from "react";
import { loginUrl } from "../lib/session";
import type { FuelMoisture } from "@linha-zero/engine";
import type { WeatherResponse } from "../api/client";
import {
  fractionToPct,
  kmhToMs,
  MAX_SPEED_KMH,
  msToKmh,
  pctToFraction,
  type Field,
  type MoistureMode,
} from "../lib/conditions";
import { DRYNESS, moistureText } from "../lib/moisture";
import type { LiveWeather, WeatherAt } from "../lib/useLiveWeather";
import { ageText, dayHour, hourMinute } from "../lib/weather";
import { Icon } from "./Icon";
import { Segmented } from "./Shell";
import { compassName, WindControl } from "./WindControl";

const WARNING_LEVEL: Record<string, string> = { yellow: "amarelo", orange: "laranja", red: "vermelho" };
const NUM = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 });

/**
 * The weather of the simulation: live by default, every value editable. A summary is always shown; the controls
 * and the source's details are behind two disclosures. A value typed by hand is marked and keeps its value when
 * the weather is fetched again; "repor" brings the source's value back.
 */
export function ConditionsPanel({
  weather,
  onRefresh,
  canRefresh,
  adjust,
  readOnly = false,
}: {
  weather: LiveWeather;
  onRefresh: () => void;
  canRefresh: boolean;
  /** More controls shown inside "Ajustar condições" (App passes the forecast toggle and the fuel dryness). */
  adjust?: React.ReactNode;
  /** The demo: the scenario's weather is shown, not fetched again or adjusted. */
  readOnly?: boolean;
}) {
  const { conditions, manual, edit, reset } = weather;
  const { wind, air } = conditions;
  const field = (f: Exclude<Field, "moisture">) => ({ manual: manual.has(f), onReset: () => reset(f) });

  return (
    <div className="conditions">
      <Summary weather={weather} onRefresh={onRefresh} canRefresh={canRefresh} readOnly={readOnly} />

      {!readOnly && (
        <details className="disclosure">
          <summary>Ajustar condições</summary>
          <div className="conditions-group">
            <h3 className="field-label">Vento</h3>
            <WindControl wind={wind} onChange={weather.editWind} />
            <div className="num-fields">
              <NumberField label="Direção (de)" unit="°" value={Math.round(wind.directionDeg)} min={0} max={359} onChange={(v) => edit("direction", v)} {...field("direction")} />
              <NumberField
                label="Velocidade"
                unit="km/h"
                value={msToKmh(wind.speedMs)}
                min={0}
                max={MAX_SPEED_KMH}
                onChange={(v) => edit("speed", kmhToMs(v))}
                {...field("speed")}
              />
            </div>
          </div>
          <div className="conditions-group">
            <h3 className="field-label">Ar</h3>
            <div className="num-fields">
              <NumberField label="Temperatura" unit="°C" value={air?.tempC ?? null} min={-20} max={50} step={0.5} onChange={(v) => edit("temp", v)} {...field("temp")} />
              <NumberField label="Humidade" unit="%" value={air?.rhPct ?? null} min={1} max={100} onChange={(v) => edit("rh", v)} {...field("rh")} />
              <NumberField label="Nuvens" unit="%" value={air?.cloudPct ?? null} min={0} max={100} onChange={(v) => edit("cloud", v)} {...field("cloud")} />
            </div>
            {!air && <p className="hint">Sem dados do ar: indicar temperatura e humidade para calcular a secura.</p>}
          </div>
          {adjust && <div className="conditions-group">{adjust}</div>}
          {manual.size > 0 && (
            <button className="link" onClick={weather.resetAll}>
              Repor tudo
            </button>
          )}
        </details>
      )}

      <details className="disclosure">
        <summary>Detalhes da fonte</summary>
        <div className="conditions-group">
          {/* The default source is already named in the summary. */}
          {sourceText(weather) !== "Valores por omissão" && <p className="hint">{sourceText(weather)}</p>}
          {weather.live && <Details s={weather.live.snapshot} />}
          <p className="hint">Dados: IPMA · Open-Meteo · fogos.pt (VOST Portugal)</p>
          <p className="hint">Modelo de Rothermel com os combustíveis portugueses, validado em 80 incêndios reais do PT-FireSprd.</p>
        </div>
      </details>
    </div>
  );
}

/** The dryness in use, as the fuel dryness control names it. */
function drynessLabel(mode: MoistureMode): string {
  if (mode === "tempo") return "Do tempo";
  if (mode === "manual") return "Manual";
  return DRYNESS.find((p) => p.id === mode)!.label;
}

/** "IPMA Braga · há 12 min": where the wind comes from and how old it is. */
function shortSource({ live, source }: LiveWeather): string {
  if (source === "live" && live) {
    const s = live.snapshot;
    return `${s.use === "observed" ? `IPMA ${s.observed!.station.name}` : "Open-Meteo"} · ${ageText(windOf(s).observedAt)}`;
  }
  return source === "scenario" ? "Tempo do cenário" : "Valores por omissão";
}

/**
 * Always shown: the wind, the air, the dryness, the source and its age, the refresh, the fire risk and warnings,
 * and anything that needs attention (values typed by hand, no service, an error, a stale wind).
 */
function Summary({
  weather,
  onRefresh,
  canRefresh,
  readOnly,
}: {
  weather: LiveWeather;
  onRefresh: () => void;
  canRefresh: boolean;
  readOnly: boolean;
}) {
  const { live, source, status, manual, conditions } = weather;
  const { wind, air } = conditions;
  const loading = status.kind === "loading";
  const s = live?.snapshot;
  const refreshLabel = source === "live" ? "Atualizar o tempo" : "Usar o tempo de agora";
  return (
    <div className="conditions-summary">
      <p className="conditions-now">
        <svg viewBox="-12 -12 24 24" className="conditions-arrow" aria-hidden>
          <g transform={`rotate(${wind.directionDeg + 180})`}>
            <line x1="0" y1="8" x2="0" y2="-6" />
            <polygon points="0,-10 -5,-3 5,-3" />
          </g>
        </svg>
        <strong>
          {msToKmh(wind.speedMs)} km/h de {compassName(wind.directionDeg)}
        </strong>
        {air ? (
          <>
            <span>{NUM.format(air.tempC)} °C</span>
            <span>HR {NUM.format(air.rhPct)}%</span>
          </>
        ) : (
          <span>Sem dados do ar</span>
        )}
        <span>Secura: {drynessLabel(conditions.moistureMode)}</span>
      </p>
      <div className="conditions-source">
        <p className="hint">{loading ? "A obter o tempo…" : shortSource(weather)}</p>
        {!readOnly && (
          <button
            className="icon-btn"
            disabled={loading || !canRefresh}
            onClick={onRefresh}
            aria-label={refreshLabel}
            title={`${refreshLabel} no ponto de ignição (ou no centro da zona)`}
          >
            <Icon name="refresh" size={18} />
          </button>
        )}
      </div>
      {s && (s.fireRisk || s.warnings.length > 0) && (
        <p className="row">
          {s.fireRisk && (
            <span>
              Risco de incêndio: <span className={`risk risk-${s.fireRisk.level}`}>{s.fireRisk.label}</span>
            </span>
          )}
          {s.warnings.map((w, i) => (
            <span key={i} className={`chip chip-${w.level}`} title={w.text}>
              Aviso {WARNING_LEVEL[w.level] ?? w.level}: {w.type}
            </span>
          ))}
        </p>
      )}
      {status.kind === "signedOut" && !readOnly && (
        <p className="hint">
          Tempo em direto só com sessão iniciada ·{" "}
          <a href={loginUrl()}>Entrar</a>
        </p>
      )}
      {status.kind === "offline" && <p className="hint">Sem tempo em direto (serviço indisponível): valores manuais.</p>}
      {status.kind === "error" && <p className="warn-text">{status.message}</p>}
      {s && s.sources.find((x) => x.name === s.windSource)?.stale && <p className="warn-text">Vento de {ageText(windOf(s).observedAt)} (sem ligação)</p>}
      {manual.size > 0 && !readOnly && (
        <p className="hint">
          {manual.size === 1 ? "1 valor ajustado à mão" : `${manual.size} valores ajustados à mão`} ·{" "}
          <button className="link" onClick={weather.resetAll}>
            Repor tudo
          </button>
        </p>
      )}
    </div>
  );
}

const windOf = (s: WeatherResponse) => (s.use === "observed" ? s.observed! : s.model!);

/** The full source line: station and distance, the hour and age, and where it was asked for. */
function sourceText({ live, source, provenance }: LiveWeather): string {
  if (source === "live" && live) {
    const s = live.snapshot;
    const where = AT_TEXT[live.at];
    const v = windOf(s);
    const name = s.use === "observed" ? `IPMA ${s.observed!.station.name} (${Math.round(s.observed!.station.distanceKm)} km)` : "Modelo Open-Meteo";
    return `${name} · ${hourMinute(v.observedAt)} (${ageText(v.observedAt)}) · ${where}`;
  }
  if (source === "scenario") {
    if (!provenance) return "Tempo do cenário";
    return provenance.source === "ipma"
      ? `Tempo do cenário: IPMA ${provenance.station}, ${dayHour(provenance.observedAt)}`
      : `Tempo do cenário: Open-Meteo, ${dayHour(provenance.observedAt)}`;
  }
  return "Valores por omissão";
}

const AT_TEXT: Record<WeatherAt, string> = { ignition: "no ponto de ignição", centre: "no centro da zona" };

/** A number field that can be cleared while typing; each valid number is applied at once. */
function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  manual,
  onChange,
  onReset,
}: {
  label: string;
  unit: string;
  value: number | null;
  min: number;
  max: number;
  step?: number;
  manual: boolean;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className={`num-field${manual ? " manual" : ""}`}>
      <label>
        <span>{label}</span>
        <span className="num-input">
          <input
            type="number"
            aria-label={label}
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            placeholder="—"
            value={draft ?? (value === null ? "" : String(value))}
            onChange={(e) => {
              setDraft(e.target.value);
              if (Number.isFinite(e.target.valueAsNumber)) onChange(e.target.valueAsNumber);
            }}
            onBlur={() => setDraft(null)}
          />
          {unit}
        </span>
      </label>
      {manual && (
        <button className="link" onClick={onReset} title="Voltar ao valor da fonte">
          ajustado · repor
        </button>
      )}
    </div>
  );
}

/** The read-only part of the live weather: the other source's wind, the air's station, the forecast, what failed. */
function Details({ s }: { s: WeatherResponse }) {
  const other = s.use === "observed" ? s.model : s.observed;
  const failed = (name: string) => s.sources.some((x) => x.name === name && x.error && !x.fetchedAt);
  const windText = (v: { directionDeg: number | null; speedMs: number }) =>
    v.directionDeg === null ? `${msToKmh(v.speedMs)} km/h (calmo)` : `${msToKmh(v.speedMs)} km/h de ${compassName(v.directionDeg)}`;
  return (
    <>
      {other && (
        <p className="hint">
          {s.use === "observed" ? "Modelo" : `IPMA ${s.observed!.station.name}`}: {windText(other)}
        </p>
      )}
      {s.air && (
        <p className="hint">
          Ar do IPMA {s.air.station.name}, {Math.round(s.air.station.distanceKm)} km, {hourMinute(s.air.observedAt)}
        </p>
      )}
      {!s.fireRisk && failed("IPMA risco de incêndio") && <p className="hint">Risco de incêndio indisponível</p>}
      {failed("IPMA avisos") && <p className="hint">Avisos indisponíveis</p>}
      {s.forecast.length > 0 && (
        <p className="hint">
          Próximas horas: {s.forecast.map((f) => `${hourMinute(f.time).slice(0, 2)}h ${compassName(f.directionDeg)} ${msToKmh(f.speedMs)} km/h`).join(" · ")}
        </p>
      )}
    </>
  );
}

const MOISTURE_FIELDS: { key: keyof FuelMoisture; label: string; min: number; max: number }[] = [
  { key: "d1", label: "Morto 1 h", min: 1, max: 60 },
  { key: "d10", label: "Morto 10 h", min: 1, max: 60 },
  { key: "d100", label: "Morto 100 h", min: 1, max: 60 },
  { key: "liveHerb", label: "Ervas", min: 30, max: 300 },
  { key: "liveWoody", label: "Arbustos", min: 30, max: 300 },
];

/** Fuel dryness: from the air ("Do tempo"), a preset, or the five values typed in. */
export function MoistureControl({ weather }: { weather: LiveWeather }) {
  const { conditions, moisture, manual } = weather;
  const mode = conditions.moistureMode;
  const preset = DRYNESS.find((p) => p.id === mode);
  return (
    <div>
      <Segmented<MoistureMode>
        label="Secura do combustível"
        value={mode}
        onChange={weather.setMoistureMode}
        options={[
          {
            value: "tempo",
            label: "Do tempo",
            disabled: !weather.canUseAir,
            title: weather.canUseAir ? "Da temperatura e humidade do ar, das nuvens e da hora" : "Sem dados do ar",
          },
          ...DRYNESS.map((p) => ({ value: p.id, label: p.label, title: p.hint })),
          { value: "manual", label: "Manual", title: "Escrever os valores" },
        ]}
      />
      {mode === "manual" && (
        <div className="num-fields">
          {MOISTURE_FIELDS.map((f) => (
            <NumberField
              key={f.key}
              label={f.label}
              unit="%"
              value={fractionToPct(moisture[f.key])}
              min={f.min}
              max={f.max}
              manual={false}
              onChange={(v) => weather.editMoisture(f.key, pctToFraction(v))}
              onReset={() => undefined}
            />
          ))}
        </div>
      )}
      <p className="hint">
        {mode === "tempo" ? `Do tempo: ${moistureText(moisture)}` : mode === "manual" ? `Manual: ${moistureText(moisture)}` : preset!.hint}
        {manual.has("moisture") && (
          <>
            {" · "}
            <button className="link" onClick={() => weather.reset("moisture")}>
              repor
            </button>
          </>
        )}
      </p>
    </div>
  );
}
