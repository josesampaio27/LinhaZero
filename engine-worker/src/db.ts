// The runs and run_rasters tables. node-postgres reads PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE itself.
import pg from "pg";
import type { RunResult } from "@linha-zero/engine";
import type { Decision, Rasters } from "./job";

export const pool = new pg.Pool({ max: 3 });
// An idle client dropped by a Postgres restart emits "error"; without a listener it would crash the process.
pool.on("error", (e) => console.log(JSON.stringify({ time: new Date().toISOString(), level: "warn", msg: "ligação ao Postgres perdida", error: e.message })));

export interface RunState {
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
}

export async function loadRun(id: string): Promise<RunState | null> {
  const r = await pool.query<RunState>("select status, attempts from runs where id = $1", [id]);
  return r.rows[0] ?? null;
}

/** Marks the row running and counts this delivery. False when the row is no longer queued/running. */
export async function startRun(id: string, host: string): Promise<boolean> {
  const r = await pool.query(
    "update runs set status = 'running', started_at = coalesce(started_at, now()), attempts = attempts + 1, worker = $2 where id = $1 and status in ('queued', 'running')",
    [id, host],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function setGridHash(id: string, hash: string): Promise<void> {
  await pool.query("update runs set grid_hash = $2 where id = $1", [id, hash]);
}

export async function setProgress(id: string, done: number): Promise<void> {
  await pool.query("update runs set progress = $2 where id = $1", [id, done]);
}

/** One transaction: the 4 rasters (a late duplicate changes nothing) and the row's result. */
export async function finishRun(id: string, result: RunResult, rasters: Record<Decision, Rasters>, host: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const d of ["A", "B"] as const) {
      for (const layer of ["arrival", "probability"] as const) {
        await client.query("insert into run_rasters (run_id, decision, layer, data) values ($1, $2, $3, $4) on conflict do nothing", [
          id,
          d,
          layer,
          rasters[d][layer],
        ]);
      }
    }
    await client.query(
      "update runs set status = 'done', result = $2, finished_at = now(), progress = 2, worker = $3, error = null where id = $1 and status = 'running'",
      [id, JSON.stringify(result), host],
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export async function failRun(id: string, error: string): Promise<void> {
  await pool.query("update runs set status = 'failed', error = $2, finished_at = now() where id = $1 and status <> 'done'", [id, error]);
}
