/// <reference lib="webworker" />
import {
  applyVariant,
  decodeGrid,
  prepareGrid,
  simulate,
  suggestLines,
  variantHash,
  type GridData,
  type GridVariant,
  type PreparedGrid,
} from "@linha-zero/engine";
import type { WorkerRequest, WorkerResponse } from "./protocol";

let base: GridData | null = null;
let official: PreparedGrid | null = null;
// Prepared grids of the variants in use, by variant hash; a comparison needs at most two.
const variants = new Map<string, PreparedGrid>();

function gridFor(variant: GridVariant | null): PreparedGrid {
  if (!base || !official) throw new Error("Grelha não carregada no worker");
  if (!variant) return official;
  const key = variantHash(variant);
  let g = variants.get(key);
  if (!g) {
    if (variants.size >= 4) variants.clear();
    g = prepareGrid(applyVariant(base, variant));
    variants.set(key, g);
  }
  return g;
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  const reply = (res: WorkerResponse, transfer: Transferable[] = []) =>
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(res, transfer);
  try {
    if (msg.type === "setGrid") {
      base = decodeGrid(msg.header, msg.buffers);
      official = prepareGrid(base);
      variants.clear();
      reply({ type: "ok", id: msg.id });
      return;
    }
    const t0 = performance.now();
    if (msg.type === "suggest") {
      const result = suggestLines(gridFor(msg.job.variant), msg.job.scenario, msg.options);
      reply({ type: "suggestions", id: msg.id, result, elapsedMs: performance.now() - t0 });
      return;
    }
    const results = msg.jobs.map((job) => simulate(gridFor(job.variant), job.scenario));
    const transfer: Transferable[] = [];
    for (const r of results) {
      transfer.push(r.arrivalMin.buffer);
      if (r.burnProbability) transfer.push(r.burnProbability.buffer);
    }
    reply({ type: "results", id: msg.id, results, elapsedMs: performance.now() - t0 }, transfer);
  } catch (err) {
    reply({ type: "error", id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
