// Types only: the contracts between the web, the API and the engine worker (examples in contracts/examples/).
import type { WeatherProvenance } from "./scenario";
import type { FuelMoisture } from "./rothermel";
import type { CellRef, EnsembleOptions, Intervention, Metrics, RunMetrics, SpreadModel, WeatherStep, Wind } from "./types";
import type { GridVariant } from "./variant";

/** Body of POST /api/v1/runs. The interventions are already rasterised to cells, so the worker runs exactly what the browser would. */
export interface RunRequest {
  grid: string;
  ignition: CellRef;
  wind: Wind;
  durationMin: number;
  /** Shared by A and B, seed included: the pairing contract of simulate(). */
  ensemble: EnsembleOptions;
  decisions: { A: Intervention[]; B: Intervention[] };
  /**
   * Optional grid variant of each decision (docs/referencia/formato-variante.md); absent or null = the official grid.
   * The worker checks it against the grid it loads (hashGrid) and applies it, coefficients included.
   */
  variants?: { A?: GridVariant | null; B?: GridVariant | null };
  /** Optional provenance of the wind, stored as is. */
  weather?: WeatherProvenance;
  /** Spread model and fuel moisture (Scenario.spreadModel, Scenario.moisture); the server always runs Rothermel (ADR 0058). */
  spreadModel?: SpreadModel;
  moisture?: FuelMoisture;
  /** Optional weather hour by hour (Scenario.weatherSteps); replaces `wind` when present. */
  weatherSteps?: WeatherStep[];
  /** Optional ignited cells, each from its own minute (an already burned area, in cells); replaces `ignition` for the spread. */
  ignitions?: { cell: CellRef; t0Min: number }[];
}

/** Stored in runs.result; the rasters travel separately. paired and likelyHa are computed in the browser. */
export interface RunResult {
  durationMin: number;
  rows: number;
  cols: number;
  A: { metrics: Metrics; runs: RunMetrics[] };
  B: { metrics: Metrics; runs: RunMetrics[] };
  elapsedMs: number;
}

/** One SSE event of GET /api/v1/runs/{id}/events, also published on runs.<id>.events. */
export type RunEvent =
  | { type: "progress"; status: "queued" | "running"; done: number; total: 2 }
  | { type: "done" }
  | { type: "failed"; error: string };
