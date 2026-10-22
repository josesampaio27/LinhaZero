import type { GridHeader, GridVariant, LayerBuffers, Scenario, SimulationResult, SuggestOptions, SuggestResult } from "@linha-zero/engine";

/** One simulation: a scenario on the official grid, or on a variant of it. */
export interface SimJob {
  scenario: Scenario;
  variant: GridVariant | null;
}

export type WorkerRequest =
  | { type: "setGrid"; id: number; header: GridHeader; buffers: LayerBuffers }
  | { type: "simulate"; id: number; jobs: SimJob[] }
  | { type: "suggest"; id: number; job: SimJob; options: SuggestOptions };

export type WorkerResponse =
  | { type: "ok"; id: number }
  | { type: "results"; id: number; results: SimulationResult[]; elapsedMs: number }
  | { type: "suggestions"; id: number; result: SuggestResult; elapsedMs: number }
  | { type: "error"; id: number; message: string };
