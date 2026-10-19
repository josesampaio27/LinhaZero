// Real fires (PT-FireSprd) as validation cases: load a case built by data-prep/build_reference.py,
// turn it into an engine scenario with the weather of those hours, simulate and score it.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prepareGrid } from "../src/grid";
import {
  deadFuelMoistureFromFfmc,
  fuelMoistureFromWeather,
  hourlyFfmc,
  isDaylight,
} from "../src/moisture";
import type { ModelParams } from "../src/params";
import {
  burnedAreaIgnitions,
  cellAt,
  type ProjectedPoint,
} from "../src/scenario";
import { simulate } from "../src/simulate";
import type {
  PreparedGrid,
  Scenario,
  SpreadModel,
  WeatherStep,
} from "../src/types";
import {
  arrivalError,
  burnedAgreement,
  type Agreement,
  type ArrivalError,
} from "../src/validation";
import { loadGridFromDir } from "./load-grid-node";

export interface HourlyWeather {
  timeUtc: string;
  tempC: number;
  rhPct: number;
  windSpeedMs: number;
  windFromDeg: number;
  cloudPct: number | null;
  precipMm?: number | null;
  /** 10 m wind gust, m/s (ERA5 only). */
  gustMs?: number | null;
}

/** One PT-FireSprd L2 interval: measured spread between two observations (minutes after the ignition). */
export interface L2Interval {
  startMin: number;
  endMin: number;
  areaHa: number | null;
  growthHaH: number | null;
  /** Spread rate (m/h) and direction (degrees, towards) from the PT-FireSprd spread lines. */
  rosMH: number | null;
  rosPerimeterMH: number | null;
  dirDeg: number | null;
  dirPerimeterDeg: number | null;
  qc: number;
  source: string;
}

export interface ReferenceCase {
  fire: string;
  dir: string;
  grid: PreparedGrid;
  observed: Float32Array;
  t0Utc: string;
  ignitionArea: ProjectedPoint[];
  observationMinutes: number[];
  fuelYear: number;
  fuelYearMatches: boolean;
  centroid: [number, number];
  weather: HourlyWeather[];
  /** ERA5-Land (9 km) at the same point: temperature and humidity only (no wind in the archive). */
  weatherEra5Land?: HourlyWeather[];
  intervals?: L2Interval[];
}

/** Which hourly weather series a scenario uses. */
export type WeatherSource = "era5" | "era5land";
/** Dead fuel moisture model: NFDRS from each hour's air (the app's), or hourly FFMC with rain and lag. */
export type MoistureModel = "nfdrs" | "ffmc";

/** How a case is turned into a scenario (Phase E switches; defaults = the app's choices). */
export interface CaseOptions {
  weather?: WeatherSource;
  moisture?: MoistureModel;
}

const ffmcCache = new WeakMap<HourlyWeather[], number[]>();
/** Hourly FFMC over a weather series, from 85 at its first hour. */
function ffmcSeries(series: HourlyWeather[]): number[] {
  let f = ffmcCache.get(series);
  if (!f) {
    let v = 85;
    f = series.map((h) => (v = hourlyFfmc(v, { tempC: h.tempC, rhPct: h.rhPct, windKmh: h.windSpeedMs * 3.6, rainMm: h.precipMm ?? 0 })));
    ffmcCache.set(series, f);
  }
  return f;
}

export const REFERENCE_DIR = join(import.meta.dirname, "../test/reference");
/** All PT-FireSprd fires, built by data-prep/build_references.py (not committed). */
export const FULL_REFERENCE_DIR = join(
  import.meta.dirname,
  "../../data-prep/out/reference",
);

export function listCases(dir = REFERENCE_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => existsSync(join(dir, name, "case.json")))
    .sort();
}

export function loadCase(fire: string, dir = REFERENCE_DIR): ReferenceCase {
  const caseDir = join(dir, fire);
  const meta = JSON.parse(readFileSync(join(caseDir, "case.json"), "utf8"));
  const grid = prepareGrid(loadGridFromDir(join(caseDir, "grid")));
  const buf = readFileSync(join(caseDir, "observed.f32"));
  const observed = new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  if (observed.length !== grid.header.rows * grid.header.cols)
    throw new Error(`${fire}: observed.f32 does not match the grid`);
  return { ...meta, dir: caseDir, grid, observed };
}

export function weatherSeries(
  c: ReferenceCase,
  source: WeatherSource = "era5",
): HourlyWeather[] {
  if (source === "era5") return c.weather;
  if (!c.weatherEra5Land?.length)
    throw new Error(`${c.fire}: sem tempo ERA5-Land (reconstruir o caso)`);
  let merged = landCache.get(c.weather);
  if (!merged) {
    // ERA5-Land (9 km) has temperature and humidity only: wind, cloud and rain stay ERA5's.
    const land = new Map(c.weatherEra5Land.map((h) => [h.timeUtc, h]));
    merged = c.weather.map((h) => {
      const l = land.get(h.timeUtc);
      return l ? { ...h, tempC: l.tempC, rhPct: l.rhPct } : h;
    });
    landCache.set(c.weather, merged);
  }
  return merged;
}
const landCache = new WeakMap<HourlyWeather[], HourlyWeather[]>();

/**
 * The hours of weather from `startMin` after the ignition to `durationMin` later, as weather steps
 * (minutes from `startMin`) with the fuel moisture of each hour.
 */
export function weatherStepsOf(
  c: ReferenceCase,
  durationMin: number,
  startMin = 0,
  source: WeatherSource = "era5",
  moistureModel: MoistureModel = "nfdrs",
): WeatherStep[] {
  const t0 = Date.parse(c.t0Utc) + startMin * 60_000;
  const [lat, lon] = c.centroid;
  const steps: WeatherStep[] = [];
  const series = weatherSeries(c, source);
  const ffmc = moistureModel === "ffmc" ? ffmcSeries(series) : undefined;
  for (const [k, h] of series.entries()) {
    const start = Date.parse(h.timeUtc);
    if (start + 3_600_000 <= t0 || start >= t0 + durationMin * 60_000) continue;
    const at = new Date(start + 1_800_000); // the middle of the hour, for the sun
    steps.push({
      fromMin: Math.max(0, (start - t0) / 60_000),
      wind: { directionDeg: h.windFromDeg, speedMs: h.windSpeedMs, ...(h.gustMs != null && { gustMs: h.gustMs }) },
      moisture: ffmc
        ? { ...fuelMoistureFromWeather({ tempC: h.tempC, rhPct: h.rhPct }, at.getUTCMonth() + 1), ...deadFuelMoistureFromFfmc(ffmc[k]) }
        : fuelMoistureFromWeather(
            {
              tempC: h.tempC,
              rhPct: h.rhPct,
              cloudPct: h.cloudPct ?? undefined,
              daylight: isDaylight(at, lat, lon),
            },
            at.getUTCMonth() + 1,
          ),
    });
  }
  return steps;
}

export function scenarioOf(
  c: ReferenceCase,
  spreadModel: SpreadModel,
  params?: Partial<ModelParams>,
  opts: CaseOptions = {},
): Scenario {
  const { header } = c.grid;
  const n = c.ignitionArea.length;
  const centre: ProjectedPoint = [
    c.ignitionArea.reduce((s, p) => s + p[0], 0) / n,
    c.ignitionArea.reduce((s, p) => s + p[1], 0) / n,
  ];
  const ignition =
    cellAt(header, centre[0], centre[1]) ??
    cellAt(header, c.ignitionArea[0][0], c.ignitionArea[0][1])!;
  const durationMin = c.observationMinutes[c.observationMinutes.length - 1];
  const weatherSteps = weatherStepsOf(c, durationMin, 0, opts.weather, opts.moisture);
  return {
    ignition,
    ignitions: burnedAreaIgnitions(header, c.ignitionArea, ignition),
    wind: weatherSteps[0].wind,
    weatherSteps,
    durationMin,
    interventions: [],
    spreadModel,
    params,
  };
}

export interface CaseScore {
  fire: string;
  model: SpreadModel;
  /** Agreement at each observation time. */
  atObservations: (Agreement & { minute: number })[];
  arrival: ArrivalError;
  /** Mean Sørensen over the observation times, and at the last one. */
  meanSorensen: number;
  finalSorensen: number;
}

/**
 * Scores one run: the deterministic one, or random realisation `run` (Rothermel breaches and spot fires
 * drawn, as in the ensemble but with the observed weather unperturbed).
 */
export function scoreCase(
  c: ReferenceCase,
  spreadModel: SpreadModel,
  params?: Partial<ModelParams>,
  run?: number,
  opts: CaseOptions = {},
): CaseScore {
  const scenario = scenarioOf(c, spreadModel, params, opts);
  const r = simulate(
    c.grid,
    run === undefined
      ? scenario
      : { ...scenario, realisation: { seed: 2035, run } },
  );
  const cellHa = (c.grid.header.cellSize * c.grid.header.cellSize) / 10_000;
  const atObservations = c.observationMinutes.map((minute) => ({
    minute,
    ...burnedAgreement(r.arrivalMin, c.observed, minute, cellHa),
  }));
  const s = atObservations.map((a) => a.sorensen);
  return {
    fire: c.fire,
    model: spreadModel,
    atObservations,
    arrival: arrivalError(r.arrivalMin, c.observed, c.observationMinutes),
    meanSorensen: s.reduce((a, b) => a + b, 0) / s.length,
    finalSorensen: s[s.length - 1],
  };
}

/** Mean of the scores over `runs` random realisations (Rothermel); the legacy model is deterministic. */
export function scoreCaseMean(
  c: ReferenceCase,
  spreadModel: SpreadModel,
  params?: Partial<ModelParams>,
  runs = 10,
): CaseScore {
  if (spreadModel === "legacy" || runs <= 1)
    return scoreCase(c, spreadModel, params);
  const all = Array.from({ length: runs }, (_, run) =>
    scoreCase(c, spreadModel, params, run),
  );
  const avg = (k: (s: CaseScore) => number) =>
    all.reduce((a, s) => a + k(s), 0) / runs;
  const first = all[0];
  return {
    ...first,
    atObservations: first.atObservations.map((a, k) => ({
      ...a,
      sorensen: avg((s) => s.atObservations[k].sorensen),
      jaccard: avg((s) => s.atObservations[k].jaccard),
      kappa: avg((s) => s.atObservations[k].kappa),
      simulatedHa: avg((s) => s.atObservations[k].simulatedHa),
    })),
    arrival: {
      ...first.arrival,
      missed: Math.round(avg((s) => s.arrival.missed)),
      meanAbsMin: avg((s) => s.arrival.meanAbsMin),
      medianAbsMin: avg((s) => s.arrival.medianAbsMin),
      biasMin: avg((s) => s.arrival.biasMin),
    },
    meanSorensen: avg((s) => s.meanSorensen),
    finalSorensen: avg((s) => s.finalSorensen),
  };
}
