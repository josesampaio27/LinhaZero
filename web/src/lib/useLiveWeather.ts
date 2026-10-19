// The weather of the current simulation: live by default (fetched where the ignition is, or at the zone's
// centre), every value overridable by hand, or the values of a loaded scenario file (ADR 0060).
import { useCallback, useMemo, useRef, useState } from "react";
import type { FuelMoisture, SavedScenario, WeatherProvenance, Wind } from "@linha-zero/engine";
import type { WeatherResponse } from "../api/client";
import {
  applyOverrides,
  clampField,
  DEFAULT_CONDITIONS,
  effectiveMoisture,
  liveBase,
  manualFields,
  moistureModeOf,
  placeOf,
  type Conditions,
  type Field,
  type MoistureMode,
  type Overrides,
  type Place,
} from "./conditions";
import type { LngLat } from "./projection";
import { fetchWeather, provenanceOf, UNAVAILABLE } from "./weather";

/** Where the live weather was asked for. */
export type WeatherAt = "ignition" | "centre";
/** Where the values without an override come from. */
export type WeatherSource = "default" | "live" | "scenario";
export type WeatherStatus = { kind: "idle" } | { kind: "loading" } | { kind: "offline" } | { kind: "error"; message: string };

const without = (o: Overrides, field: Field): Overrides => {
  const rest = { ...o };
  delete rest[field];
  return rest;
};

interface Request {
  lngLat: LngLat;
  at: WeatherAt;
  time: Date;
}

export function useLiveWeather() {
  const [base, setBase] = useState<Conditions>(DEFAULT_CONDITIONS);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [source, setSource] = useState<WeatherSource>("default");
  const [live, setLive] = useState<{ snapshot: WeatherResponse; at: WeatherAt } | null>(null);
  const [status, setStatus] = useState<WeatherStatus>({ kind: "idle" });
  const [request, setRequest] = useState<Request | null>(null);
  // Provenance a scenario file brought; kept while its wind has no override.
  const [fileWeather, setFileWeather] = useState<WeatherProvenance | undefined>(undefined);
  // Only the latest request may land: the ignition can move again, or a scenario load, before an answer arrives.
  const seq = useRef(0);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const fetchAt = useCallback((lngLat: LngLat, at: WeatherAt) => {
    const my = ++seq.current;
    setRequest({ lngLat, at, time: new Date() });
    setStatus({ kind: "loading" });
    fetchWeather(lngLat[1], lngLat[0]).then(
      (snapshot) => {
        if (my !== seq.current) return;
        setLive({ snapshot, at });
        setBase((b) => liveBase(snapshot, b));
        setSource("live");
        setStatus({ kind: "idle" });
      },
      (e: unknown) => {
        if (my !== seq.current) return;
        const message = e instanceof Error ? e.message : String(e);
        setStatus(message === UNAVAILABLE ? { kind: "offline" } : { kind: "error", message });
      },
    );
  }, []);

  /** Live weather without anyone asking (a zone loaded): never over the values of a loaded scenario file. */
  const autoFetchAt = useCallback(
    (lngLat: LngLat, at: WeatherAt) => {
      if (sourceRef.current !== "scenario") fetchAt(lngLat, at);
    },
    [fetchAt],
  );

  const loadFromScenario = useCallback((saved: SavedScenario) => {
    seq.current++; // an answer in flight would overwrite the file's values
    setBase({ ...DEFAULT_CONDITIONS, wind: saved.wind, air: null, ...(saved.moisture ? moistureModeOf(saved.moisture) : {}) });
    setOverrides({});
    setLive(null);
    setSource("scenario");
    setStatus({ kind: "idle" });
    setFileWeather(saved.weather);
  }, []);

  const conditions = useMemo(() => applyOverrides(base, overrides), [base, overrides]);
  // Daylight and month for the dryness of the air: those of the snapshot, else when and where it was asked for.
  const place: Place | null = useMemo(
    () => (live ? placeOf(live.snapshot) : request ? { lon: request.lngLat[0], lat: request.lngLat[1], at: request.time } : null),
    [live, request],
  );
  const moisture = useMemo(() => effectiveMoisture(conditions, place), [conditions, place]);
  const manual = useMemo(() => new Set(manualFields(overrides)), [overrides]);

  const edit = useCallback((field: Exclude<Field, "moisture">, value: number) => {
    if (!Number.isFinite(value)) return;
    setOverrides((o) => ({ ...o, [field]: clampField(field, value) }));
  }, []);

  /** The wind control changes one of direction or speed at a time. */
  const editWind = useCallback(
    (w: Wind) => {
      if (w.directionDeg !== conditions.wind.directionDeg) edit("direction", w.directionDeg);
      if (w.speedMs !== conditions.wind.speedMs) edit("speed", w.speedMs);
    },
    [conditions.wind, edit],
  );

  /** "Do tempo" or a preset; choosing the source's own mode removes the override. "manual" starts from the values in use. */
  const setMoistureMode = useCallback(
    (mode: MoistureMode) =>
      setOverrides((o) =>
        mode === base.moistureMode && mode !== "manual" ? without(o, "moisture") : { ...o, moisture: { mode, values: moisture } },
      ),
    [base.moistureMode, moisture],
  );

  const editMoisture = useCallback(
    (key: keyof FuelMoisture, value: number) => {
      if (!Number.isFinite(value)) return;
      const values = { ...moisture, [key]: Math.min(3, Math.max(0.01, value)) };
      setOverrides((o) => ({ ...o, moisture: { mode: "manual", values } }));
    },
    [moisture],
  );

  const reset = useCallback((field: Field) => {
    setOverrides((o) => without(o, field));
  }, []);

  const resetAll = useCallback(() => setOverrides({}), []);

  // Saved files and server runs keep where the wind came from only while nobody changed it.
  const windTyped = manual.has("direction") || manual.has("speed");
  const provenance = windTyped ? undefined : live ? provenanceOf(live.snapshot) : source === "scenario" ? fileWeather : undefined;

  return {
    conditions,
    moisture,
    manual,
    live,
    source,
    status,
    provenance,
    canUseAir: !!conditions.air && !!place,
    fetchAt,
    autoFetchAt,
    loadFromScenario,
    edit,
    editWind,
    setMoistureMode,
    editMoisture,
    reset,
    resetAll,
  };
}

export type LiveWeather = ReturnType<typeof useLiveWeather>;
