// Scenario files ("Guardar cenário", web/public/scenarios/*.json) and their conversion into engine
// scenarios. The web app, the Node scripts and the tests all use this module, so they simulate the
// same thing. Errors are user-facing, so their messages are in Portuguese.
import { rasterizePolygon, rasterizePolyline } from "./geometry";
import { gridToProjected, projectedToGrid } from "./grid";
import { calibrationFor } from "./calibration";
import { DEFAULT_PARAMS, type ModelParams } from "./params";
import { SIZE_CLASSES, type FuelMoisture } from "./rothermel";
import type { CellRef, EnsembleOptions, GridHeader, Intervention, InterventionKind, Scenario, SpreadModel, WeatherStep, Wind } from "./types";
import { parseGridVariant, type GridVariant } from "./variant";

export type DecisionId = "A" | "B";

/** A point in EPSG:3763 metres: [x, y]. */
export type ProjectedPoint = [number, number];

/** An intervention as drawn on the map, kept in EPSG:3763 metres so it survives a change of resolution. */
export interface DrawnIntervention {
  id: string;
  kind: InterventionKind;
  startMin: number;
  rateFactor?: number;
  /** Containment lines: width in metres (Rothermel breach); absent = the default width. */
  widthM?: number;
  coords: ProjectedPoint[];
}

/** Everything a comparison needs besides the grid. */
export interface ScenarioInputs {
  ignition: ProjectedPoint | null;
  wind: Wind;
  durationMin: number;
  ensemble: boolean;
  decisions: Record<DecisionId, DrawnIntervention[]>;
  /** Grid variant each decision runs on; null = the official grid. A variant only on B compares grids. */
  variants: Record<DecisionId, GridVariant | null>;
  /** Spread model: always Rothermel in the app (the simple model was retired, ADR 0058); kept for older files. */
  spreadModel?: SpreadModel;
  /** Fuel moisture for the Rothermel model; absent = DEFAULT_MOISTURE. */
  moisture?: FuelMoisture;
  /** Weather hour by hour (Scenario.weatherSteps); absent = the constant `wind` (and `moisture`). */
  weatherSteps?: WeatherStep[];
  /** Area already burned when the simulation starts (a polygon in EPSG:3763 metres); burns from minute 0 with the ignition. */
  burnedArea?: ProjectedPoint[];
}

/** Where the wind came from when "Usar o tempo de agora" filled it (also sent with server runs). */
export interface WeatherProvenance {
  source: "ipma" | "open-meteo";
  station?: string;
  observedAt: string;
  fetchedAt: string;
}

/** What "Guardar cenário" writes and "Carregar cenário" / ?scenario= read. Variants travel inside the file. */
export interface SavedScenario extends ScenarioInputs {
  version: 3;
  title?: string;
  grid: string;
  /** Present only while the wind is still the one filled from live weather; absent when set by hand. */
  weather?: WeatherProvenance;
}

/** Ensemble used when uncertainty is on. The fixed seed is what pairs run k of A with run k of B. */
export const DEFAULT_ENSEMBLE: EnsembleOptions = { runs: 30, windDirJitterDeg: 20, windSpeedJitterPct: 25, seed: 2035 };

const KINDS: InterventionKind[] = ["containmentLine", "suppression", "protectZone"];

/** Rate factor a zone gets when it does not set its own; a grid variant can change it. */
export function defaultRateFactor(kind: InterventionKind, params: Partial<ModelParams> = {}): number | undefined {
  if (kind === "suppression") return params.suppressionFactor ?? DEFAULT_PARAMS.suppressionFactor;
  if (kind === "protectZone") return params.protectFactor ?? DEFAULT_PARAMS.protectFactor;
  return undefined;
}

/** Cell containing a point in EPSG:3763 metres, or null if it falls outside the grid. */
export function cellAt(header: GridHeader, x: number, y: number): CellRef | null {
  const p = projectedToGrid(header, x, y);
  const row = Math.floor(p.y), col = Math.floor(p.x);
  return row >= 0 && col >= 0 && row < header.rows && col < header.cols ? { row, col } : null;
}

/** Converts a drawn intervention into the engine's cell-based form; params give the default zone factors. */
export function toEngineIntervention(header: GridHeader, d: DrawnIntervention, params: Partial<ModelParams> = {}): Intervention {
  const pts = d.coords.map(([x, y]) => projectedToGrid(header, x, y));
  if (d.kind === "containmentLine") {
    return {
      kind: d.kind,
      startMin: d.startMin,
      cells: rasterizePolyline(pts, header.rows, header.cols),
      ...(d.widthM !== undefined && { widthM: d.widthM }),
    };
  }
  return {
    kind: d.kind,
    startMin: d.startMin,
    rateFactor: d.rateFactor ?? defaultRateFactor(d.kind, params) ?? 1,
    cells: rasterizePolygon(pts, header.rows, header.cols),
  };
}

/**
 * Builds the engine scenario of one decision, with the model coefficients of its grid variant (if any).
 * The grid itself (official or variant) is chosen by the caller. Throws if there is no ignition or it is outside the grid.
 */
export function buildScenario(header: GridHeader, inputs: ScenarioInputs, decision: DecisionId): Scenario {
  if (!inputs.ignition) throw new Error("Sem ignição");
  const ignition = cellAt(header, inputs.ignition[0], inputs.ignition[1]);
  if (!ignition) throw new Error("A ignição está fora da grelha");
  const params = inputs.variants[decision]?.params ?? {};
  const modelParams = rothermelParams(params, header.cellSize);
  return {
    ignition,
    wind: inputs.wind,
    durationMin: inputs.durationMin,
    interventions: inputs.decisions[decision].map((d) => toEngineIntervention(header, d, params)),
    ensemble: inputs.ensemble ? rothermelEnsemble(DEFAULT_ENSEMBLE, params, header.cellSize) : undefined,
    params: Object.keys(modelParams).length ? modelParams : undefined,
    spreadModel: "rothermel" as const,
    moisture: inputs.moisture,
    ...(inputs.weatherSteps?.length && { weatherSteps: inputs.weatherSteps }),
    ...(inputs.burnedArea && inputs.burnedArea.length >= 3 && { ignitions: burnedAreaIgnitions(header, inputs.burnedArea, ignition) }),
  };
}

/**
 * Parameters of a Rothermel run: the calibration on real fires of the grid's resolution (calibrationFor:
 * 100 m or 30 m), then a grid variant's own values.
 */
export function rothermelParams(variantParams: Partial<ModelParams> = {}, cellSize = 100): Partial<ModelParams> {
  return { ...calibrationFor(cellSize).params, ...variantParams };
}

/**
 * Calibration samples for a Rothermel ensemble, without the coefficients a grid variant sets itself (the
 * variant's value then holds in every run).
 */
export function rothermelSamples(variantParams: Partial<ModelParams> = {}, cellSize = 100): Partial<ModelParams>[] {
  const own = new Set(Object.keys(variantParams));
  return calibrationFor(cellSize).samples.map((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !own.has(k))));
}

/**
 * A Rothermel ensemble: the given runs and seed, with the wind jitter and perturbations checked against
 * real fires (BURN_CHANCE_ENSEMBLE) and the calibration samples. The app and the server both use it, so
 * the probability means the same everywhere.
 */
export function rothermelEnsemble(base: EnsembleOptions, variantParams: Partial<ModelParams> = {}, cellSize = 100): EnsembleOptions {
  const paramSamples = rothermelSamples(variantParams, cellSize);
  return {
    runs: base.runs,
    seed: base.seed,
    ...calibrationFor(cellSize).ensemble,
    ...(paramSamples.length && { paramSamples }),
  };
}

/** The ignition point and every cell of the burned area, all from minute 0. */
export function burnedAreaIgnitions(header: GridHeader, area: ProjectedPoint[], ignition: CellRef): { cell: CellRef; t0Min: number }[] {
  const ring = area.map(([x, y]) => projectedToGrid(header, x, y));
  const cells = rasterizePolygon(ring, header.rows, header.cols);
  return [ignition, ...cells].map((cell) => ({ cell, t0Min: 0 }));
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPoint = (v: unknown): v is ProjectedPoint =>
  Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);

function invalid(why: string): never {
  throw new Error(`Ficheiro de cenário inválido: ${why}`);
}

/** Name of the grid a scenario file uses, so its header can be loaded before parseSavedScenario. */
export function savedScenarioGrid(raw: unknown): string {
  if (!isObject(raw) || typeof raw.grid !== "string" || raw.grid === "") invalid("falta a grelha");
  return raw.grid;
}

function parseIntervention(raw: unknown, where: string, fallbackId: string): DrawnIntervention {
  if (!isObject(raw)) invalid(`${where} não é um objeto`);
  const kind = raw.kind as InterventionKind;
  if (!KINDS.includes(kind)) invalid(`${where} tem um tipo desconhecido (${String(raw.kind)})`);
  if (!Number.isFinite(raw.startMin) || (raw.startMin as number) < 0) invalid(`${where} tem um minuto de início inválido`);
  if (raw.rateFactor !== undefined && (!Number.isFinite(raw.rateFactor) || (raw.rateFactor as number) < 0)) {
    invalid(`${where} tem um fator de velocidade inválido`);
  }
  if (raw.widthM !== undefined && (!Number.isFinite(raw.widthM) || (raw.widthM as number) <= 0)) {
    invalid(`${where} tem uma largura inválida`);
  }
  const needed = kind === "containmentLine" ? 2 : 3;
  if (!Array.isArray(raw.coords) || raw.coords.length < needed || !raw.coords.every(isPoint)) {
    invalid(`${where} precisa de pelo menos ${needed} pontos [x, y] em metros`);
  }
  return {
    id: typeof raw.id === "string" ? raw.id : fallbackId,
    kind,
    startMin: raw.startMin as number,
    rateFactor: raw.rateFactor as number | undefined,
    ...(raw.widthM !== undefined && { widthM: raw.widthM as number }),
    coords: raw.coords,
  };
}

/**
 * Validates a scenario file against the header of its grid and returns it in the current version.
 * Version 1 files stored the ignition as a cell; it becomes the centre of that cell. Versions 1 and 2
 * have no grid variants. Missing wind and duration get defaults.
 */
export function parseSavedScenario(raw: unknown, header: GridHeader): SavedScenario {
  const grid = savedScenarioGrid(raw);
  const s = raw as Record<string, unknown>;
  if (s.version !== 1 && s.version !== 2 && s.version !== 3) invalid(`versão desconhecida (${String(s.version)})`);

  let ignition: ProjectedPoint | null = null;
  if (s.ignition != null) {
    if (s.version === 1) {
      const c = s.ignition as Partial<CellRef>;
      if (!Number.isInteger(c.row) || !Number.isInteger(c.col)) invalid("a ignição não é uma célula");
      const p = gridToProjected(header, c.col! + 0.5, c.row! + 0.5);
      ignition = [p.x, p.y];
    } else {
      if (!isPoint(s.ignition)) invalid("a ignição não é um ponto [x, y] em metros");
      ignition = s.ignition;
    }
    if (!cellAt(header, ignition[0], ignition[1])) invalid("a ignição está fora da grelha");
  }

  const wind = (s.wind ?? { directionDeg: 270, speedMs: 5 }) as Wind;
  if (!Number.isFinite(wind.directionDeg) || !Number.isFinite(wind.speedMs) || wind.speedMs < 0) invalid("vento inválido");
  const durationMin = s.durationMin ?? 240;
  if (!Number.isFinite(durationMin) || (durationMin as number) <= 0) invalid("duração inválida");
  if (!isObject(s.decisions)) invalid("faltam as decisões");
  const decisions = {} as Record<DecisionId, DrawnIntervention[]>;
  for (const d of ["A", "B"] as const) {
    const list = s.decisions[d] ?? [];
    if (!Array.isArray(list)) invalid(`a decisão ${d} não é uma lista`);
    decisions[d] = list.map((iv, i) => parseIntervention(iv, `a ação ${i + 1} da decisão ${d}`, `${d}${i + 1}`));
  }
  const variants: Record<DecisionId, GridVariant | null> = { A: null, B: null };
  if (s.variants !== undefined) {
    if (!isObject(s.variants)) invalid("as variantes de grelha não são um objeto");
    for (const d of ["A", "B"] as const) {
      const v = s.variants[d];
      if (v == null) continue;
      try {
        variants[d] = parseGridVariant(v, header);
      } catch (e) {
        invalid(`a variante da decisão ${d}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  return {
    version: 3,
    title: typeof s.title === "string" ? s.title : undefined,
    grid,
    ignition,
    wind: { directionDeg: wind.directionDeg, speedMs: wind.speedMs },
    durationMin: durationMin as number,
    ensemble: !!s.ensemble,
    decisions,
    variants,
    weather: parseProvenance(s.weather),
    ...parseSpreadModel(s.spreadModel, s.moisture, invalid),
    ...(s.weatherSteps !== undefined && { weatherSteps: parseWeatherSteps(s.weatherSteps, invalid) }),
    ...(s.burnedArea !== undefined && { burnedArea: parseBurnedArea(s.burnedArea) }),
  };
}

function parseBurnedArea(raw: unknown): ProjectedPoint[] {
  if (!Array.isArray(raw) || raw.length < 3 || !raw.every(isPoint)) invalid("a área ardida não é um polígono de pontos [x, y] em metros");
  return raw;
}

/** Validates the ignited cells of a run request against the grid's size. */
export function parseIgnitions(raw: unknown, rows: number, cols: number): { cell: CellRef; t0Min: number }[] {
  if (!Array.isArray(raw) || raw.length > rows * cols) throw new Error("as ignições não são uma lista válida");
  return raw.map((it, i) => {
    const cell = (it as { cell?: Partial<CellRef> })?.cell;
    const t0Min = (it as { t0Min?: unknown })?.t0Min;
    const okCell = cell && Number.isInteger(cell.row) && Number.isInteger(cell.col) && cell.row! >= 0 && cell.col! >= 0 && cell.row! < rows && cell.col! < cols;
    if (!okCell || typeof t0Min !== "number" || !Number.isFinite(t0Min) || t0Min < 0) throw new Error(`ignição ${i + 1} inválida`);
    return { cell: { row: cell.row!, col: cell.col! }, t0Min };
  });
}

/** Validates weather steps (from a scenario file or a run request); fail receives a Portuguese message. */
export function parseWeatherSteps(
  raw: unknown,
  fail: (why: string) => never = (why) => {
    throw new Error(why);
  },
): WeatherStep[] {
  const invalid: (why: string) => never = fail;
  if (!Array.isArray(raw)) invalid("os passos do tempo não são uma lista");
  if (raw.length > 48) invalid("demasiados passos do tempo (máximo 48)");
  let last = -Infinity;
  return raw.map((step, i) => {
    const what = `o passo do tempo ${i + 1}`;
    if (!isObject(step)) invalid(`${what} não é um objeto`);
    const st = step as Record<string, unknown>;
    const fromMin = st.fromMin;
    if (typeof fromMin !== "number" || !Number.isFinite(fromMin) || fromMin < 0 || fromMin <= last) {
      invalid(`${what}: o minuto de início tem de ser ≥ 0 e crescente`);
    }
    last = fromMin;
    const w = st.wind as Partial<Wind> | undefined;
    if (!w || !Number.isFinite(w.directionDeg) || !Number.isFinite(w.speedMs) || w.speedMs! < 0) invalid(`${what}: vento inválido`);
    if (w.gustMs !== undefined && (!Number.isFinite(w.gustMs) || w.gustMs < 0)) invalid(`${what}: rajada inválida`);
    const out: WeatherStep = {
      fromMin,
      wind: { directionDeg: w.directionDeg!, speedMs: w.speedMs!, ...(w.gustMs !== undefined && { gustMs: w.gustMs }) },
    };
    if (st.moisture !== undefined) {
      const m = parseSpreadModel("rothermel", st.moisture, (why) => invalid(`${what}: ${why}`)).moisture;
      if (m) out.moisture = m;
    }
    return out;
  });
}

/**
 * Validates an optional spread model and fuel moisture (from a scenario file or a run request);
 * fail receives a Portuguese message. The app and the server only run the Rothermel model: absent or
 * "legacy" (the retired simple model, ADR 0058) is read as Rothermel, so older files and clients still
 * work. Optional in scenario files version 3.
 */
export function parseSpreadModel(
  model: unknown,
  moisture: unknown,
  fail: (why: string) => never = (why) => {
    throw new Error(why);
  },
): { spreadModel: "rothermel"; moisture?: FuelMoisture } {
  const invalid: (why: string) => never = fail;
  if (model !== undefined && model !== null && model !== "legacy" && model !== "rothermel") invalid(`modelo de propagação desconhecido (${String(model)})`);
  if (moisture === undefined || moisture === null) return { spreadModel: "rothermel" };
  if (!isObject(moisture)) invalid("a humidade do combustível não é um objeto");
  const raw = moisture as Record<string, unknown>;
  const m = {} as FuelMoisture;
  for (const k of SIZE_CLASSES) {
    const v = raw[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 3) invalid(`humidade do combustível "${k}" inválida (fração entre 0 e 3)`);
    m[k] = v;
  }
  return { spreadModel: "rothermel", moisture: m };
}

// The file comes from the user: keep the provenance only when it has the expected shape.
function parseProvenance(w: unknown): WeatherProvenance | undefined {
  const p = w as Partial<WeatherProvenance> | undefined;
  if (!p || (p.source !== "ipma" && p.source !== "open-meteo") || typeof p.observedAt !== "string" || typeof p.fetchedAt !== "string") return undefined;
  if (p.station !== undefined && typeof p.station !== "string") return undefined;
  return { source: p.source, station: p.station, observedAt: p.observedAt, fetchedAt: p.fetchedAt };
}
