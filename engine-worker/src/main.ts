// Engine worker: pulls runs.jobs one message at a time, runs the two decisions, stores the result, publishes progress.
import { createServer } from "node:http";
import { hostname } from "node:os";
import { AckPolicy, connect, nanos, RetentionPolicy, StorageType, type JsMsg } from "nats";
import type { RunEvent, RunRequest, SimulationResult } from "@linha-zero/engine";
import * as db from "./db";
import { DECISIONS, loadGrid, rastersOf, runDecision, toResult, variantProblem, type Decision } from "./job";

const host = process.env.HOSTNAME ?? hostname();
const gridsDir = process.env.GRIDS_DIR ?? "web/public/grids";
const MAX_ATTEMPTS = 3;

const log = (level: "info" | "warn" | "error", msg: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, worker: host, ...fields }));

let stopping = false;
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    log("info", `${sig}: a terminar depois da decisão atual`);
    stopping = true;
  });
}

const nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222", name: `engine-worker-${host}`, waitOnFirstConnect: true, maxReconnectAttempts: -1 });
const jsm = await nc.jetstreamManager();
// Same config as the API (backend/src/LinhaZero.Api/Messaging/NatsStreamSetup.cs); whoever starts first creates it.
try {
  await jsm.streams.info("RUNS");
} catch {
  await jsm.streams.add({ name: "RUNS", subjects: ["runs.jobs"], retention: RetentionPolicy.Workqueue, storage: StorageType.File, duplicate_window: nanos(120_000) });
}
try {
  await jsm.consumers.info("RUNS", "engine");
} catch {
  await jsm.consumers.add("RUNS", { durable_name: "engine", ack_policy: AckPolicy.Explicit, ack_wait: nanos(60_000), max_deliver: -1 });
}
const consumer = await nc.jetstream().consumers.get("RUNS", "engine");

const publish = (runId: string, ev: RunEvent) => nc.publish(`runs.${runId}.events`, JSON.stringify(ev));

const nak = (msg: JsMsg, delayMs?: number) => {
  try {
    msg.nak(delayMs);
  } catch (e) {
    log("warn", "nak falhou", { error: e instanceof Error ? e.message : String(e) });
  }
};

async function handle(msg: JsMsg): Promise<void> {
  let id = "?";
  try {
    let job: RunRequest & { runId: string };
    try {
      job = msg.json<RunRequest & { runId: string }>();
      if (typeof job?.runId !== "string" || !job.runId) throw new Error("sem runId");
    } catch (e) {
      log("warn", "mensagem inválida descartada", { error: e instanceof Error ? e.message : String(e) });
      msg.term();
      return;
    }
    id = job.runId;
    const row = await db.loadRun(id);
    if (!row) {
      log("warn", "corrida desconhecida", { runId: id });
      msg.term();
      return;
    }
    if (row.status === "done" || row.status === "failed") {
      msg.ack();
      return;
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      await db.failRun(id, `falhou ${MAX_ATTEMPTS} vezes`);
      publish(id, { type: "failed", error: `falhou ${MAX_ATTEMPTS} vezes` });
      msg.term();
      log("warn", "corrida abandonada", { runId: id, attempts: row.attempts });
      return;
    }
    if (!(await db.startRun(id, host))) {
      msg.ack(); // the row was failed or finished meanwhile
      return;
    }
    publish(id, { type: "progress", status: "running", done: 0, total: 2 });
    const grid = loadGrid(gridsDir, job.grid); // per job, so a grid rebuilt by the geo-pipeline is picked up at once
    await db.setGridHash(id, grid.hash);
    // A grid variant made for another version of the grid, or an invalid spread model, fails the same way every
    // time: fail now, do not retry.
    const bad = variantProblem(grid.prepared, grid.hash, job);
    if (bad) {
      await db.failRun(id, bad);
      publish(id, { type: "failed", error: bad });
      msg.term();
      log("warn", "pedido recusado", { runId: id, error: bad });
      return;
    }
    log("info", "a simular", { runId: id, grid: job.grid, runs: job.ensemble.runs, attempt: row.attempts + 1, variants: !!job.variants });

    const t0 = performance.now();
    const results = {} as Record<Decision, SimulationResult>;
    for (const d of DECISIONS) {
      msg.working(); // simulate blocks the event loop for seconds; this is the last signal before it starts
      results[d] = runDecision(grid.prepared, job, d, grid.hash);
      const done = d === "A" ? 1 : 2;
      await db.setProgress(id, done);
      publish(id, { type: "progress", status: "running", done, total: 2 });
      if (stopping && d === "A") {
        // ponytail: one blocking job per process; worker_threads or per-run yielding needs an onRun hook in simulate (engine change)
        nak(msg);
        log("info", "a sair a meio: job devolvido à fila", { runId: id });
        return;
      }
    }
    const elapsedMs = Math.round(performance.now() - t0);
    await db.finishRun(id, toResult(grid.prepared, job, results, elapsedMs), { A: rastersOf(results.A), B: rastersOf(results.B) }, host);
    publish(id, { type: "done" });
    msg.ack();
    log("info", "corrida concluída", { runId: id, elapsedMs });
  } catch (e) {
    log("error", "job falhou; nova entrega em 5 s", { runId: id, error: e instanceof Error ? e.message : String(e) });
    nak(msg, 5000);
  }
}

const health = createServer((_, res) => res.end("ok")).listen(9090);
log("info", "worker pronto", { grids: gridsDir, nats: process.env.NATS_URL ?? "nats://localhost:4222" });

// One message at a time: a busy worker never holds jobs another worker could take, and a stopped one vanishes from
// idleWorkers within the 10 s expiry.
while (!stopping) {
  try {
    const msg = await consumer.next({ expires: 10_000 });
    if (!msg) continue;
    if (stopping) {
      nak(msg);
      break;
    }
    await handle(msg);
  } catch (e) {
    // The pull itself failed (NATS reconnecting, consumer deleted, ...): pause and try again rather than die.
    log("error", "ciclo de pull falhou; nova tentativa em 2 s", { error: e instanceof Error ? e.message : String(e) });
    await new Promise((r) => setTimeout(r, 2000));
  }
}
await nc.drain();
await db.pool.end();
health.close();
log("info", "worker terminado");
process.exit(0);
