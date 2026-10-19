// One job = the two decisions of a run-request on a grid, plus the 4 result rasters. No NATS or Postgres here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyVariant,
  checkVariantBase,
  decodeGrid,
  hashGrid,
  gridLayerNames,
  parseGridVariant,
  parseSpreadModel,
  rothermelParams,
  rothermelEnsemble,
  parseWeatherSteps,
  parseIgnitions,
  fuelBases,
  DEFAULT_MOISTURE,
  prepareGrid,
  simulate,
  type GridData,
  type GridHeader,
  type LayerBuffers,
  type PreparedGrid,
  type RunRequest,
  type RunResult,
  type Scenario,
  type SimulationResult,
} from "@linha-zero/engine";

export type Decision = "A" | "B";
export const DECISIONS: Decision[] = ["A", "B"];

/** Little-endian Float32, rows × cols × 4 bytes each, as stored in run_rasters. */
export interface Rasters {
  arrival: Buffer;
  probability: Buffer;
}

export interface LoadedGrid {
  name: string;
  /**
   * hashGrid of the grid (header in canonical JSON plus every layer), stored in runs.grid_hash for the audit trail.
   * It is the same hash the browser computes, so grid variants made in the browser can be checked against it.
   */
  hash: string;
  prepared: PreparedGrid;
}

/**
 * Decodes layers from Node Buffers. Each one is copied into its own ArrayBuffer first: a Buffer can be a slice of a
 * shared pool, and decodeGrid builds typed arrays on the whole underlying ArrayBuffer.
 */
export function decodeFromBuffers(header: GridHeader, buffers: LayerBuffers<Buffer>): GridData {
  const own = {} as LayerBuffers;
  for (const name of gridLayerNames(header)) {
    const b = buffers[name];
    if (!b) throw new Error(`Layer "${name}" is listed in the header but was not loaded`);
    own[name] = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  return decodeGrid(header, own);
}

/** Reads `<dir>/<name>/` (header.json + layer binaries); about 7 ms, so it is done per job and never cached. */
export function loadGrid(dir: string, name: string): LoadedGrid {
  const header: GridHeader = JSON.parse(readFileSync(join(dir, name, "header.json"), "utf8"));
  const buffers = {} as LayerBuffers<Buffer>;
  for (const layer of gridLayerNames(header)) buffers[layer] = readFileSync(join(dir, name, header.layers[layer]!));
  const data = decodeFromBuffers(header, buffers);
  return { name, hash: hashGrid(data), prepared: prepareGrid(data) };
}

/**
 * The grid decision d runs on: the official one, or its grid variant from the request (docs/referencia/formato-variante.md).
 * The variant is validated with the same engine function as in the browser and must be based on this exact grid.
 */
export function gridForDecision(grid: PreparedGrid, gridHash: string, request: RunRequest, d: Decision): { grid: PreparedGrid; params?: Scenario["params"] } {
  const raw = request.variants?.[d];
  if (raw == null) return { grid };
  const variant = parseGridVariant(raw, grid.header);
  checkVariantBase(variant, gridHash);
  return { grid: prepareGrid(applyVariant(grid, variant)), params: Object.keys(variant.params).length ? variant.params : undefined };
}

/**
 * Why the request cannot run on this grid (a Portuguese message), or null when it can: a grid variant made for
 * another version of the grid, or an invalid spread model or fuel moisture. Never worth retrying.
 */
export function variantProblem(grid: PreparedGrid, gridHash: string, request: RunRequest): string | null {
  try {
    const model = parseSpreadModel(request.spreadModel, request.moisture);
    if (request.weatherSteps != null) parseWeatherSteps(request.weatherSteps);
    if (request.ignitions != null) parseIgnitions(request.ignitions, grid.header.rows, grid.header.cols);
    fuelBases(grid, model.moisture ?? DEFAULT_MOISTURE);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  for (const d of DECISIONS) {
    const raw = request.variants?.[d];
    if (raw == null) continue;
    try {
      checkVariantBase(parseGridVariant(raw, grid.header), gridHash);
    } catch (e) {
      return `decisão ${d}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return null;
}

/** Runs one decision. A and B share the request's ensemble options, seed included: the pairing contract of simulate(). */
export function runDecision(grid: PreparedGrid, request: RunRequest, d: Decision, gridHash = request.variants ? hashGrid(grid) : ""): SimulationResult {
  const target = gridForDecision(grid, gridHash, request, d);
  const scenario: Scenario = {
    ignition: request.ignition,
    wind: request.wind,
    durationMin: request.durationMin,
    interventions: request.decisions[d],
    // Always Rothermel (ADR 0058). Runs and seed from the client; jitter, perturbations and samples are the server's own.
    ensemble: request.ensemble && rothermelEnsemble(request.ensemble, target.params),
    params: rothermelParams(target.params),
    ...parseSpreadModel(request.spreadModel, request.moisture),
    ...(request.weatherSteps != null && { weatherSteps: parseWeatherSteps(request.weatherSteps) }),
    ...(request.ignitions != null && { ignitions: parseIgnitions(request.ignitions, grid.header.rows, grid.header.cols) }),
  };
  return simulate(target.grid, scenario);
}

export function rastersOf(r: SimulationResult): Rasters {
  const bytes = (a: Float32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
  if (!r.burnProbability) throw new Error("Resultado sem ensemble");
  return { arrival: bytes(r.arrivalMin), probability: bytes(r.burnProbability) };
}

export function toResult(grid: PreparedGrid, request: RunRequest, results: Record<Decision, SimulationResult>, elapsedMs: number): RunResult {
  const part = (r: SimulationResult) => ({ metrics: r.metrics, runs: r.runs ?? [] });
  return {
    durationMin: request.durationMin,
    rows: grid.header.rows,
    cols: grid.header.cols,
    A: part(results.A),
    B: part(results.B),
    elapsedMs,
  };
}

/** Both decisions in one go, for tests; main.ts runs them one at a time to report progress in between. */
export function runJob(grid: PreparedGrid, request: RunRequest): { result: RunResult; rasters: Record<Decision, Rasters> } {
  const t0 = performance.now();
  const results = { A: runDecision(grid, request, "A"), B: runDecision(grid, request, "B") };
  return {
    result: toResult(grid, request, results, Math.round(performance.now() - t0)),
    rasters: { A: rastersOf(results.A), B: rastersOf(results.B) },
  };
}
