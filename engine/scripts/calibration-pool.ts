// Scores parameter sets on real fires in parallel: a pool of worker threads, each holding every case in
// memory, fed one (parameter set, fire) task at a time so large and small fires balance out.
import { cpus } from "node:os";
import { MinHeap } from "../src/heap";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import type { ModelParams } from "../src/params";
import type { SpreadModel } from "../src/types";
import {
  anchorError,
  brierIntervals,
  ensembleFromIgnitionParts,
  ensembleIntervals,
  fromIgnitionCoverage,
  rateSamples,
  scoreIntervals,
  weightedCost,
  weightedCoverageCost,
  type EnsembleTally,
} from "./intervals";
import type { EnsembleOptions } from "../src/types";
import { loadCase, scoreCase, type MoistureModel, type ReferenceCase, type WeatherSource } from "./reference";

export interface Task {
  params: Partial<ModelParams> | undefined;
  fire: number;
  /**
   * "intervals": weighted interval cost (lower is better); "cumulative": mean Sørensen from the ignition;
   * "brier": Brier score of `runs` random realisations on the intervals (run k with samples[k % n]).
   * "coverage": the coverage cost of the intervals (ADR 0065, lower is better); "coverageMixed": plus
   * 1 − the Tversky index from the ignition; "coverageParts": both and their parts (CoverageParts, via runAny).
   */
  metric: "intervals" | "cumulative" | "brier" | "ensemble" | "early" | "rates" | "coverage" | "coverageMixed" | "coverageParts";
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

/** One fire under the coverage score (ADR 0065). */
export interface CoverageParts {
  /** Coverage cost of the intervals, with the head-speed term. */
  coverage: number;
  /** From the ignition: mean Tversky, recall and Sørensen over the observation times. */
  tversky: number;
  recall: number;
  sorensen: number;
  /** coverage + (1 − tversky): the combined objective. */
  mixed: number;
  /** Mean head-speed error of the fast runs (NaN: none), and how many. */
  anchor: number;
  anchorN: number;
  /** Share of the extra burn of the intervals left out as beyond a held flank. */
  maskedShare: number;
  /** From the ignition, at the last observation: simulated over observed burned area. */
  areaRatio: number;
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
      // The whole fire and its first observation, from one ensemble run.
      ...ensembleFromIgnitionParts(c, t.params, t.ensemble!, { spreadModel: model, ...opts }),
    };
  if (t.metric === "brier")
    return brierIntervals(c, t.params, t.runs ?? 20, { spreadModel: model, ...opts, paramSamples: t.samples }).brier;
  // Sørensen at the first observation, from the ignition: the fire before suppression builds up.
  if (t.metric === "early") return scoreCase(c, model, t.params, undefined, opts).atObservations[0].sorensen;
  if (t.metric === "rates") return rateSamples(scoreIntervals(c, t.params, { spreadModel: model, ...opts })) as never;
  if (t.metric === "coverage" || t.metric === "coverageMixed" || t.metric === "coverageParts") {
    const cellHa = (c.grid.header.cellSize * c.grid.header.cellSize) / 10_000;
    const s = scoreIntervals(c, t.params, { spreadModel: model, ...opts });
    if (!s.length) return t.metric === "coverageParts" ? (null as never) : NaN;
    const coverage = weightedCoverageCost(s, cellHa);
    if (t.metric === "coverage") return coverage;
    const cum = scoreCase(c, model, t.params, undefined, opts);
    const from = fromIgnitionCoverage(cum.atObservations);
    const mixed = coverage + (1 - from.tversky);
    if (t.metric === "coverageMixed") return mixed;
    const fast = s.filter((x) => x.anchor);
    const fp = s.reduce((a, x) => a + x.fp, 0);
    const parts: CoverageParts = {
      coverage,
      ...from,
      sorensen: cum.meanSorensen,
      mixed,
      anchor: fast.length ? fast.reduce((a, x) => a + anchorError(x), 0) / fast.length : NaN,
      anchorN: fast.length,
      maskedShare: fp ? s.reduce((a, x) => a + x.fpHeld, 0) / fp : 0,
      areaRatio: (() => {
        const last = cum.atObservations[cum.atObservations.length - 1];
        return last.observedHa > 0 ? last.simulatedHa / last.observedHa : NaN;
      })(),
    };
    return parts as never;
  }
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

/** Worker threads by default: every core (the main thread only waits for results). */
export const defaultJobs = () => Math.max(1, cpus().length);

export class Pool {
  private readonly workers: Worker[];
  private readonly idle: Worker[] = [];
  // Waiting tasks, longest first (by the measured mean time of the same metric on the same fire), so
  // the big fires do not end up alone at the end of a batch while the other workers wait.
  private readonly queue = new MinHeap(4096);
  private readonly queued = new Map<number, { id: number; task: Task }>();
  private readonly pending = new Map<number, { resolve: (v: never) => void; reject: (e: Error) => void; key: string; start: number }>();
  private readonly meanMs = new Map<string, { ms: number; n: number }>();
  private nextId = 0;

  constructor(
    cases: CaseRef[],
    size = defaultJobs(),
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
        const t = this.meanMs.get(p.key) ?? { ms: 0, n: 0 };
        this.meanMs.set(p.key, { ms: (t.ms * t.n + (performance.now() - p.start)) / (t.n + 1), n: t.n + 1 });
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
    if (this.queue.size === 0) {
      this.idle.push(w);
      return;
    }
    const next = this.queued.get(this.queue.pop())!;
    this.queued.delete(next.id);
    this.pending.get(next.id)!.start = performance.now();
    w.postMessage(next);
  }

  run(t: Task): Promise<number> {
    return this.runAny<number>(t);
  }

  /** Like run, for metrics that return more than a number ("ensemble"). */
  runAny<T>(t: Task): Promise<T> {
    const task = { ...this.defaults, ...t };
    const id = this.nextId++;
    const key = `${task.metric}|${task.model ?? ""}|${task.fire}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: never) => void, reject, key, start: performance.now() });
      const w = this.idle.pop();
      if (w) w.postMessage({ id, task });
      else {
        // Unknown tasks first: they may be long, and their time is then known.
        this.queue.push(-(this.meanMs.get(key)?.ms ?? Infinity), id);
        this.queued.set(id, { id, task });
      }
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
