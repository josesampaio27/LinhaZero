import { DEFAULT_ENSEMBLE, type GridHeader, type RunEvent, type RunRequest, type RunResult, type SimulationResult } from "@linha-zero/engine";
import type { RunStatusResponse } from "../api/client";
import { healthApi, runsApi } from "./api";

/** The server runs the same ensemble as the browser, with more runs. */
export const SERVER_ENSEMBLE = { ...DEFAULT_ENSEMBLE, runs: 200 };

const START_TIMEOUT_MS = 20_000; // no worker picked the job up
const DONE_TIMEOUT_MS = 120_000;

export interface ServerResults {
  A: SimulationResult;
  B: SimulationResult;
  elapsedMs: number;
}

// Every call below throws on any failure (ApiError, ApiUnreachable); the caller then runs in the browser.

/** The run's row. The API passes `result` through as the run-result contract, so its type comes from the engine. */
async function getRun(runId: string): Promise<RunStatusResponse & { result: RunResult | null }> {
  const row = await runsApi.get(runId);
  return { ...row, result: row.result as RunResult | null };
}

async function raster(runId: string, decision: "A" | "B", layer: "arrival" | "probability", n: number): Promise<Float32Array> {
  const file = await runsApi.raster(runId, decision, layer);
  const buf = await file.data.arrayBuffer();
  if (buf.byteLength !== n * 4) throw new Error(`raster ${decision}/${layer} com ${buf.byteLength} bytes, esperados ${n * 4}`);
  return new Float32Array(buf);
}

/** Follows the SSE stream until done. Rejects when no worker starts within 20 s, nothing finishes within 120 s, or the run fails. */
function waitForDone(runId: string, onProgress: (done: number) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // EventSource, not the generated runsApi.events(): that one waits for the whole body, and this stream is open-ended.
    const es = new EventSource(`/api/v1/runs/${runId}/events`);
    let started = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = (err?: Error) => {
      es.close(); // otherwise EventSource reconnects for ever
      timers.forEach(clearTimeout);
      if (err) reject(err);
      else resolve();
    };
    timers.push(setTimeout(() => !started && finish(new Error("nenhum worker começou em 20 s")), START_TIMEOUT_MS));
    timers.push(setTimeout(() => finish(new Error("sem resultado em 120 s")), DONE_TIMEOUT_MS));
    const parse = <T extends RunEvent>(e: MessageEvent): T | null => {
      try {
        return JSON.parse(e.data) as T;
      } catch {
        finish(new Error("evento ilegível"));
        return null;
      }
    };
    es.addEventListener("progress", (e) => {
      const ev = parse<Extract<RunEvent, { type: "progress" }>>(e);
      if (ev?.status === "running") {
        started = true; // the "queued" state sent at connect does not count
        onProgress(ev.done);
      }
    });
    es.addEventListener("done", () => finish());
    es.addEventListener("failed", (e) => {
      const ev = parse<Extract<RunEvent, { type: "failed" }>>(e);
      if (ev) finish(new Error(ev.error));
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        finish(new Error("ligação ao servidor fechada"));
        return;
      }
      // Connection lost: the row decides. Progress means the worker is alive and EventSource may reconnect.
      getRun(runId).then(
        (row) => {
          if (row.status === "done") finish();
          else if (row.status === "failed") finish(new Error(row.error ?? "falhou"));
          else if (!started && row.progress === 0) finish(new Error("ligação perdida sem progresso"));
        },
        (e) => finish(e instanceof Error ? e : new Error(String(e))),
      );
    };
  });
}

/** POST the run, follow it to the end and rebuild the two SimulationResults from the result and the 4 rasters. */
export async function runOnServer(header: GridHeader, request: RunRequest, onProgress: (done: number) => void): Promise<ServerResults> {
  const { runId } = await runsApi.create(request);
  await waitForDone(runId, onProgress);
  const row = await getRun(runId);
  const result = row.result;
  if (row.status !== "done" || !result) throw new Error(row.error ?? "corrida sem resultado");
  // A different grid on the server would give rasters of another size.
  if (result.rows !== header.rows || result.cols !== header.cols) throw new Error(`grelha diferente no servidor (${result.rows}×${result.cols})`);
  const n = header.rows * header.cols;
  const [aArr, aProb, bArr, bProb] = await Promise.all([
    raster(runId, "A", "arrival", n),
    raster(runId, "A", "probability", n),
    raster(runId, "B", "arrival", n),
    raster(runId, "B", "probability", n),
  ]);
  return {
    A: { arrivalMin: aArr, burnProbability: aProb, metrics: result.A.metrics, runs: result.A.runs },
    B: { arrivalMin: bArr, burnProbability: bProb, metrics: result.B.metrics, runs: result.B.runs },
    elapsedMs: result.elapsedMs,
  };
}

/** True when the API answered and at least one worker is waiting for a job. */
export async function workersAvailable(): Promise<boolean> {
  try {
    const h = await healthApi.get();
    return h.idleWorkers >= 1;
  } catch {
    return false;
  }
}
