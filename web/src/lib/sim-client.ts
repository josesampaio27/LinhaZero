import type { GridHeader, LayerBuffers, SimulationResult, SuggestOptions, SuggestResult } from "@linha-zero/engine";
import type { SimJob, WorkerRequest, WorkerResponse } from "../worker/protocol";

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** Promise wrapper around the simulation Web Worker. */
export class SimClient {
  private worker = new Worker(new URL("../worker/sim.worker.ts", import.meta.url), { type: "module" });
  private nextId = 1;
  private pending = new Map<number, (res: WorkerResponse) => void>();

  constructor() {
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const cb = this.pending.get(ev.data.id);
      this.pending.delete(ev.data.id);
      cb?.(ev.data);
    };
  }

  private request(msg: DistributiveOmit<WorkerRequest, "id">): Promise<WorkerResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (res) => (res.type === "error" ? reject(new Error(res.message)) : resolve(res)));
      this.worker.postMessage({ ...msg, id } as WorkerRequest);
    });
  }

  /** Sends a grid to the worker (buffers are copied, the caller keeps its own). */
  async setGrid(header: GridHeader, buffers: LayerBuffers): Promise<void> {
    await this.request({ type: "setGrid", header, buffers });
  }

  /** Candidate containment lines added to one decision, each simulated (engine suggestLines). */
  async suggest(job: SimJob, options: SuggestOptions): Promise<{ result: SuggestResult; elapsedMs: number }> {
    const res = await this.request({ type: "suggest", job, options });
    if (res.type !== "suggestions") throw new Error("Resposta inesperada do worker");
    return { result: res.result, elapsedMs: res.elapsedMs };
  }

  async simulate(jobs: SimJob[]): Promise<{ results: SimulationResult[]; elapsedMs: number }> {
    const res = await this.request({ type: "simulate", jobs });
    if (res.type !== "results") throw new Error("Resposta inesperada do worker");
    return { results: res.results, elapsedMs: res.elapsedMs };
  }
}
