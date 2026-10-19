// Scores parameter sets on real fires in parallel: a pool of worker threads, each holding every case in
// memory, fed one (parameter set, fire) task at a time so large and small fires balance out.
import { cpus } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import type { ModelParams } from "../src/params";
import type { SpreadModel } from "../src/types";
import { brierIntervals, ensembleFromIgnition, ensembleIntervals, rateSamples, scoreIntervals, weightedCost, type EnsembleTally } from "./intervals";
import type { EnsembleOptions } from "../src/types";
import { loadCase, scoreCase, type MoistureModel, type ReferenceCase, type WeatherSource } from "./reference";

export interface Task {
  params: Partial<ModelParams> | undefined;
  fire: number;
  /**
   * "intervals": weighted interval cost (lower is better); "cumulative": mean Sørensen from the ignition;
   * "brier": Brier score of `runs` random realisations on the intervals (run k with samples[k % n]).
   */
  metric: "intervals" | "cumulative" | "brier" | "ensemble" | "early" | "rates";
  /** "intervals": score free-running intervals only. */
  freeOnly?: boolean;
  /** For "ensemble": the ensemble options (returns an EnsembleTally, via runAny). */
  ensemble?: EnsembleOptions;
  samples?: Partial<ModelParams>[];
  runs?: number;
  model?: SpreadModel;
  weather?: WeatherSource;
  moisture?: MoistureModel;
}

export interface CaseRef {
  fire: string;
  dir: string;
}

function evaluate(c: ReferenceCase, t: Task): number | { all: EnsembleTally; free: EnsembleTally; fromIgnition: EnsembleTally; early: EnsembleTally } {
  const model = t.model ?? "rothermel";
  const opts = { weather: t.weather, moisture: t.moisture };
  if (t.metric === "cumulative") return scoreCase(c, model, t.params, undefined, opts).meanSorensen;
  if (t.metric === "ensemble")
    return {
      ...ensembleIntervals(c, t.params, t.ensemble!, { spreadModel: model, ...opts }),
      fromIgnition: ensembleFromIgnition(c, t.params, t.ensemble!, { spreadModel: model, ...opts }),
      early: ensembleFromIgnition(c, t.params, t.ensemble!, { spreadModel: model, ...opts, firstOnly: true }),
    };
  if (t.metric === "brier")
    return brierIntervals(c, t.params, t.runs ?? 20, { spreadModel: model, ...opts, paramSamples: t.samples }).brier;
  // Sørensen at the first observation, from the ignition: the fire before suppression builds up.
  if (t.metric === "early") return scoreCase(c, model, t.params, undefined, opts).atObservations[0].sorensen;
  if (t.metric === "rates") return rateSamples(scoreIntervals(c, t.params, { spreadModel: model, ...opts })) as never;
  const s = scoreIntervals(c, t.params, { spreadModel: model, ...opts, freeOnly: t.freeOnly });
  return s.length ? weightedCost(s) : NaN;
}

if (!isMainThread && workerData?.calibrationPool) {
  const refs = workerData.cases as CaseRef[];
  const cache = new Map<number, ReferenceCase>();
  parentPort!.on("message", ({ id, task }: { id: number; task: Task }) => {
    try {
      let c = cache.get(task.fire);
      if (!c) cache.set(task.fire, (c = loadCase(refs[task.fire].fire, refs[task.fire].dir)));
      parentPort!.postMessage({ id, value: evaluate(c, task) });
    } catch (e) {
      parentPort!.postMessage({ id, error: String(e) });
    }
  });
}

export class Pool {
  private readonly workers: Worker[];
  private readonly idle: Worker[] = [];
  private readonly queue: { id: number; task: Task }[] = [];
  private readonly pending = new Map<number, { resolve: (v: never) => void; reject: (e: Error) => void }>();
  private nextId = 0;

  constructor(
    cases: CaseRef[],
    size = Math.max(1, cpus().length - 1),
    /** Applied to every task unless it sets its own (weather source, moisture model). */
    private readonly defaults: Pick<Task, "weather" | "moisture" | "freeOnly"> = {},
  ) {
    this.workers = Array.from({ length: size }, () => {
      const w = new Worker(new URL("./calibration-worker.mjs", import.meta.url), {
        workerData: { calibrationPool: true, cases },
      });
      w.on("message", (m: { id: number; value?: never; error?: string }) => {
        const p = this.pending.get(m.id)!;
        this.pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error));
        else p.resolve(m.value!);
        this.dispatch(w);
      });
      w.on("error", (e) => {
        for (const p of this.pending.values()) p.reject(e);
      });
      this.idle.push(w);
      return w;
    });
  }

  private dispatch(w: Worker) {
    const next = this.queue.shift();
    if (next) w.postMessage(next);
    else this.idle.push(w);
  }

  run(t: Task): Promise<number> {
    return this.runAny<number>(t);
  }

  /** Like run, for metrics that return more than a number ("ensemble"). */
  runAny<T>(t: Task): Promise<T> {
    const task = { ...this.defaults, ...t };
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: never) => void, reject });
      const w = this.idle.pop();
      if (w) w.postMessage({ id, task });
      else this.queue.push({ id, task });
    });
  }

  /** The metric of one parameter set on each of `fires`. */
  scores(params: Partial<ModelParams> | undefined, fires: number[], opts: Omit<Task, "params" | "fire"> = { metric: "intervals" }) {
    return Promise.all(fires.map((fire) => this.run({ ...opts, params, fire })));
  }

  close() {
    return Promise.all(this.workers.map((w) => w.terminate()));
  }
}
