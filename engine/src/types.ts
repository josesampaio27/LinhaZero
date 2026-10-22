// Shared data contracts between data-prep, engine and web.
// All rasters are row-major, starting at the north-west corner.
import type { ModelParams } from "./params";
import type { FuelMoisture, FuelParams } from "./rothermel";

/** Header of a grid on disk: one JSON plus one binary file per layer. */
export interface GridHeader {
  name: string; // e.g. "guimaraes-teste"
  crs: "EPSG:3763"; // PT-TM06, metres
  originX: number; // north-west corner, metres
  originY: number;
  cellSize: number; // metres (e.g. 100)
  rows: number;
  cols: number;
  layers: {
    fuel: string; // Uint8: fuel code
    elevation: string; // Float32: metres
    barrier: string; // Uint8: 0 = none; 1 = barrier (river, motorway); 2-255 = road or break of that width in m (Rothermel: breakable)
    buildings: string; // Uint16: number of buildings in the cell
    village: string; // Uint16: village id (0 = none)
    /** Optional. Uint8: tree canopy cover in % (Copernicus Tree Cover Density); 255 = no data. */
    canopy?: string;
  };
  villages: { id: number; name: string }[];
  /** baseRate (m/min) drives the legacy model; rothermel, when present, the Rothermel model. */
  fuelTable: Record<number, FuelEntry>;
  /**
   * Optional: a real fire to compare with (replays of PT-FireSprd fires, data-prep/export_replay.py).
   * `file` is a GeoJSON (WGS84) of the area burned by each observation time, property `minute` after
   * the ignition at t0Utc.
   */
  observed?: { file: string; fire: string; t0Utc: string; source: string };
}

export interface FuelEntry {
  label: string;
  baseRate: number; // m/min; 0 = not burnable in either model
  rothermel?: FuelParams;
}

/** "legacy": baseRate × exp(wind) × exp(slope). "rothermel": Rothermel with an elliptical fire shape. */
export type SpreadModel = "legacy" | "rothermel";

export type LayerName = keyof GridHeader["layers"];
/** Layers every grid has. */
export type RequiredLayerName = Exclude<LayerName, "canopy">;
/** Raw layer bytes of a grid: the required layers, plus the optional ones its header lists. */
export type LayerBuffers<T = ArrayBuffer> = Record<RequiredLayerName, T> & Partial<Record<"canopy", T>>;

/** A grid with its layers decoded into typed arrays. */
export interface GridData {
  header: GridHeader;
  fuel: Uint8Array;
  elevation: Float32Array;
  barrier: Uint8Array;
  buildings: Uint16Array;
  village: Uint16Array;
  /** Tree canopy cover, % (255 = no data); only when the grid has the layer. */
  canopy?: Uint8Array;
}

/** A grid ready for simulation, with derived per-cell values. */
export interface PreparedGrid extends GridData {
  /** Base spread rate per cell in m/min (0 = never burns, barriers included). */
  baseRate: Float32Array;
}

export interface CellRef {
  row: number;
  col: number;
}

/**
 * A cell set alight at minute t0Min (t0Min < 0: before the simulation starts). burned: the cell is part
 * of a burned area at t0Min (its centre burned, the front part way to its edges: SEED_SHARE in
 * spread-rothermel.ts), so an observed burned area (cells whose centre the observed perimeter covers)
 * restarts where the observed front is, on average, at any cell size.
 */
export interface Ignition {
  cell: CellRef;
  t0Min: number;
  burned?: boolean;
}

export interface Wind {
  directionDeg: number; // direction the wind blows FROM (meteorological convention)
  speedMs: number;
  /** Optional 10 m wind gust, m/s (forecast or reanalysis); used with ModelParams.gustShare. */
  gustMs?: number;
}

export interface Scenario {
  ignition: CellRef;
  /**
   * Several ignited cells, each from its own minute (an observed perimeter, a spot fire); replaces
   * `ignition` for the spread, which stays as the reference point.
   */
  ignitions?: Ignition[];
  wind: Wind;
  durationMin: number; // e.g. 240
  interventions: Intervention[];
  ensemble?: EnsembleOptions;
  /** Model coefficients overriding DEFAULT_PARAMS (from a grid variant); none = defaults. */
  params?: Partial<ModelParams>;
  /** Spread model; "legacy" when omitted. */
  spreadModel?: SpreadModel;
  /**
   * Makes the main run one random realisation (Rothermel: line and road breaches drawn, spot fires on),
   * like ensemble run `run` of `seed` but without perturbing the wind. Omitted = the deterministic run.
   */
  realisation?: { seed: number; run: number };
  /** Fuel moisture for the Rothermel model; DEFAULT_MOISTURE when omitted. */
  moisture?: FuelMoisture;
  /**
   * Weather that changes during the fire, in time order; replaces `wind` (and, per step, `moisture`)
   * when present. Each step holds from its minute until the next one; the first should start at 0.
   */
  weatherSteps?: WeatherStep[];
  /**
   * Ensemble only: also the burn probability at each of these minutes (≤ durationMin), from the same
   * runs. Arrivals before a minute do not depend on how long the run goes on, so one run to the last
   * minute gives what a separate ensemble to each minute would (validation scripts).
   */
  probabilityAtMin?: number[];
  /** Rothermel: also record, for the main run, how the fire reached each cell (SimulationResult.explain). */
  explain?: boolean;
}

/** The weather from minute fromMin until the next step. */
export interface WeatherStep {
  fromMin: number;
  wind: Wind;
  /** Fuel moisture during this step (Rothermel); omitted = the scenario's moisture. */
  moisture?: FuelMoisture;
}

export interface EnsembleOptions {
  runs: number;
  windDirJitterDeg: number;
  windSpeedJitterPct: number;
  seed: number;
  /**
   * Calibration uncertainty (Rothermel): run k also uses paramSamples[k % n] on top of the scenario's
   * params. The main run keeps the scenario's params. Same samples and seed = same run k, so pairing holds.
   */
  paramSamples?: Partial<ModelParams>[];
  /** Other uncertain inputs, drawn per run (see EnsemblePerturbation); omitted = wind only. */
  perturb?: EnsemblePerturbation;
}

/**
 * Per-run perturbation of uncertain inputs besides the wind. Each run draws its values from
 * hashRandom(seed, run, purpose, k), so they depend only on the seed and the run (pairing holds).
 */
export interface EnsemblePerturbation {
  /** Dead fuel moisture shifted by a uniform draw in ±this many points (0.01 = 1 point); Rothermel only. */
  deadMoisturePts: number;
  /** Spread factor of each fuel group multiplied by exp(σ·z), z standard normal; Rothermel only. */
  fuelLogSd: number;
  /** A single ignition point moved uniformly within this radius (m); not for drawn burned areas. */
  ignitionRadiusM: number;
}

/**
 * A firefighting action, in cells. Each acts from startMin until endMin (absent = to the end of the run);
 * ADR 0070 for the backfire, the aerial drop and the end times.
 */
export type Intervention =
  // The cells stop burning from startMin; widthM: Rothermel breach (default params.lineWidthM). After endMin
  // the line is no longer held and the fire crosses it as if it were not there.
  | { kind: "containmentLine"; cells: CellRef[]; startMin: number; endMin?: number; widthM?: number }
  | { kind: "suppression"; cells: CellRef[]; startMin: number; endMin?: number; rateFactor: number } // e.g. 0.2 = fire 5x slower
  | { kind: "protectZone"; cells: CellRef[]; startMin: number; endMin?: number; rateFactor: number }
  // Water or retardant on a strip: holds the fire while it lasts, if the fire is not too intense
  // (params.aerialFullKwM / aerialNoneKwM).
  | { kind: "aerialDrop"; cells: CellRef[]; startMin: number; endMin?: number }
  // A backfire: `cells` is the control line it is lit from (held like a containment line), `litCells` the
  // cells set alight at startMin, on the side of the line facing the fire.
  | { kind: "backfire"; cells: CellRef[]; litCells: CellRef[]; startMin: number; endMin?: number; widthM?: number };

export type InterventionKind = Intervention["kind"];

/** Every intervention kind, in the order the app lists them. */
export const INTERVENTION_KINDS: readonly InterventionKind[] = ["containmentLine", "suppression", "protectZone", "aerialDrop", "backfire"];

/**
 * How the fire reached each cell in the main run (Scenario.explain, Rothermel only): where it came from and
 * what made it fast there. Read it with firePath and explainPath (explain.ts).
 */
export interface FireExplain {
  /** Cell the fire came from; -1 = an ignition, a lit backfire cell or a cell not reached. */
  from: Int32Array;
  /** Rate (m/min) at which the fire entered the cell, in the direction it came, after any slowdown. */
  rate: Float32Array;
  /** The cell's head rate when the fire reached it (m/min): r0 × (1 + windPart + slopePart), or the crown fire's. */
  headRate: Float32Array;
  /** No-wind, no-slope rate of the cell's fuel at that moment (m/min, calibration included). */
  r0: Float32Array;
  windPart: Float32Array;
  slopePart: Float32Array;
  /** Bit 1: the crown fire set the head rate; bit 2: an "Ataque" or "Proteger zona" slowed the fire there. */
  flags: Uint8Array;
}

export const EXPLAIN_CROWN = 1;
export const EXPLAIN_SLOWED = 2;

export interface SimulationResult {
  arrivalMin: Float32Array; // fire arrival minute per cell; Infinity = does not burn
  /** With Scenario.explain (Rothermel): how the fire reached each cell in the main run. */
  explain?: FireExplain;
  burnProbability?: Float32Array; // 0..1, only with ensemble
  /** With Scenario.probabilityAtMin: the burn probability at each of those minutes, in the same order. */
  burnProbabilityAt?: Float32Array[];
  /** Fireline intensity (kW/m) as the fire arrived in each cell, main run; 0 = not burned. Rothermel only. */
  intensityKwM?: Float32Array;
  /** One entry per perturbed run, in run order; only with ensemble. Run k of two scenarios with the same ensemble options and base wind used the same wind. */
  runs?: RunMetrics[];
  metrics: Metrics;
}

export interface RunMetrics {
  buildingsReached: number;
  burnedHa: number; // at durationMin
}

export interface Metrics {
  burnedHaByHour: number[]; // hectares burned at the end of hour 1, 2, 3, 4...
  buildingsReached: number; // buildings in cells with arrivalMin <= durationMin
  villages: { id: number; name: string; firstArrivalMin: number | null }[];
}
