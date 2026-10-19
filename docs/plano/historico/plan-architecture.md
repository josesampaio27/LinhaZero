# Plan: split into services (proposta-tecnica §5)

Goal: the architecture of `docs/proposta-tecnica.md` §5 running locally with `docker compose up`, with each part able to scale on its own:

- an API/BFF (.NET);
- an ingestion worker (.NET) that pulls IPMA, Open-Meteo and fogos.pt on a schedule;
- engine workers that run large paired ensembles from a queue;
- the geospatial pipeline as a batch job.

The browser keeps its own engine for instant single runs and for the offline demo.

This plan **builds on `plan-weather.md`** (being implemented now). That plan's parsers, selection rules, UI card and incident markers stay. What changes is where they run: the single on-request `ingest/` service becomes a scheduled worker plus a read API, backed by PostgreSQL instead of a file cache.

Decisions already taken by the user: the full §5 split, PostgreSQL for shared snapshots, Docker Compose to run it.

## Target picture

```text
             external: IPMA · Open-Meteo · fogos.pt
                       │ pull on a schedule (the only thing that calls them)
                 [ingest]  .NET, 1 leader (Postgres advisory lock), spares wait
                       │ INSERT snapshots
                       ▼
                  [postgres]  snapshots · source_status · runs · run_rasters
                   ▲       ▲
                   │       │ result + rasters
       read/insert │   [engine-worker] x N   Node 24 + @linha-zero/engine (Rust later, same contract)
                   │       ▲   pulls runs.jobs one at a time, publishes runs.<id>.events (core NATS)
                   │    [nats]  JetStream stream RUNS = ["runs.jobs"] only
                   │       ▲
                 [api] x N   .NET 10, stateless, REST + SSE under /api/v1
                   ▲
                   │  Vite proxy /api
             web (browser engine for single runs and offline)

   web/public/grids/  ── read-only bind mount ──> api, engine-worker, ingest
   [geo-pipeline]  batch (compose profile), writes web/public/grids/<name>/
```

**Rules that make it scale:**
- **The API holds no state** beyond memoised, immutable data (parsed snapshots keyed by their row `id`). Everything else lives in Postgres or NATS. Progress events reach any API replica through a core NATS subscription, so N replicas behind a load balancer just work.
- **Engine workers compete for jobs** on a JetStream work queue. Each worker pulls **one message at a time**, acks explicitly, gets redelivery after a crash, and writes idempotently by `runId`. `docker compose up --scale engine-worker=4` gives 4× throughput, with no code change.
- **Ingest is a singleton by design**, because there is no point pulling IPMA twice. Spare replicas block on a Postgres advisory lock held on a dedicated connection, and take over when the leader's connection dies.
- **Only `ingest` talks to the outside world.** The engine never calls APIs (§5.1).
- **Every service is configured by environment variables, has a readiness endpoint, and logs JSON to stdout.**

## Deviations from §5 / §6 (each goes in `docs/decisoes.md`)

| §5/§6 says | This plan | Why |
| --- | --- | --- |
| Rust engine workers | **Node 24 workers running the existing TS engine** | §3.6 itself says "durante a semana do hackathon não reescrevemos o motor". The job/result contract is language-neutral, so a Rust worker can replace this one later without touching the API or the web |
| Object storage (COG, Zarr, results) | **No object storage.** Grids: a read-only bind mount of `web/public/grids` into every service. Result rasters: `bytea` rows in Postgres | The `minio/minio` and `minio/mc` images can no longer be pulled (checked 2026-10-17). A single grid copy also guarantees the browser and the server simulate the same grid. Rasters are about 95 KB × 4 per run, so Postgres handles them and they work across hosts. **"Objeto S3 quando houver K8s ou grelhas nacionais"** (S3 objects once there is K8s or national grids) is the trigger to add it |
| PostGIS | **Plain `postgres:16`** | Nothing spatial is queried yet, and `postgis/postgis` is amd64-only. Switch images the day a geometry column appears |
| SignalR | **Server-Sent Events** (`TypedResults.ServerSentEvents` in .NET 10) | Progress only flows server → browser. SSE is native in the browser (`EventSource`), with no npm dependency. SignalR comes back when shared annotations (§5.3 step 5) need two-way traffic |
| Redis for cache and job state | **No Redis.** Job state lives in Postgres; progress goes over core NATS | One store fewer to run. Redis is added when there is a measured cache need |
| Quartz.NET, Polly | `BackgroundService` + `PeriodicTimer`; retry/backoff written by hand (already done in plan-weather) | Six fixed intervals do not need a scheduler library |
| EF Core | **Npgsql with plain SQL**; schema in `infra/db/*.sql`, applied by the Postgres init scripts. **A schema change means `npm run down -- -v`** until a migration tool exists | Four tables. Migration tooling comes with the scenario and incident tables |
| Contracts generated from one schema | **Shared example JSON files** in `contracts/examples/`, which tests on both sides deserialize and round-trip | Same guarantee (both sides agree on every field they use) with no generator and no schema library |
| Keycloak, roles, audit, OpenTelemetry, K8s/KEDA, OSRM | **Out of scope** (see the end of this plan) | Not needed to prove the split. Each has a clear slot in this layout |

## Repository layout (after)

```text
contracts/
  examples/run-request.json  run-result.json  run-event-*.json  weather.json  incidents.json
  README.md                  field-by-field meaning; the source of truth for the TS and C# types
engine/src/contracts.ts      types only: RunRequest, RunResult, RunEvent (shared by the web and the worker)
services/
  LinhaZero.slnx
  Data/            class library: parsers + selection from plan-weather (Weather.cs, Incidents.cs),
                   Snapshots.cs (snapshots + source_status), LeaderLock.cs, Grids.cs (reads the mounted grids)
  Ingest/          Microsoft.NET.Sdk.Web: scheduled pulls → snapshots, plus /health
  Api/             ASP.NET Core minimal API: weather, incidents, runs, SSE, rasters, health
  Tests/           xUnit: everything from plan-weather + the new tests below
engine-worker/     npm workspace: Node 24 worker (TypeScript, run with tsx)
  src/main.ts  src/job.ts  src/db.ts
  test/job.test.ts
infra/
  docker-compose.yml
  db/001_init.sql
  demo/load.sql  demo/snapshots.csv   seed for the offline demo
  smoke.sh
  README.md
data-prep/
  Dockerfile       the existing build_grid.py as a batch image
```

`engine/src/contracts.ts` is the only change in `engine/`. It is types only, so the web never depends on the worker package or its server dependencies.

The plan-weather `ingest/` project moves into `services/`:

| Before (plan-weather) | After |
| --- | --- |
| `Weather.cs`, `Incidents.cs` | `services/Data/`, unchanged |
| The fetch and backoff part of `UpstreamCache` | `services/Ingest/Puller.cs` |
| The file-cache part of `UpstreamCache` | Replaced by `services/Data/Snapshots.cs` (Postgres) |
| Tests | `services/Tests/` |
| `ingest/demo-cache/` | `infra/demo/` |

`ingest/` is deleted once its tests pass in the new place.

## Infrastructure (`infra/docker-compose.yml`)

Each `<x>` is an exact patch version, chosen when the file is written. Run `docker manifest inspect <image>` before committing, to check that every tag exists for both amd64 and arm64.

| Service | Image | Host ports | Notes |
| --- | --- | --- | --- |
| `postgres` | `postgres:16.<x>-alpine` | 5432 | Volume `pgdata`. `infra/db/` mounted at `/docker-entrypoint-initdb.d`. Health check `["CMD-SHELL","pg_isready -U $$POSTGRES_USER"]` (`$$` so compose does not substitute it) |
| `nats` | `nats:2.10.<x>-alpine`, command `-js -sd /data -m 8222` | 4222, 8222 | Volume `natsdata`. Health check `wget -qO- http://localhost:8222/healthz?js-enabled-only=true` (the alpine image has wget; the scratch image has no shell) |
| `ingest` | built from `services/Ingest` (final stage `mcr.microsoft.com/dotnet/aspnet:10.0.<x>`) | — | `depends_on: postgres: service_healthy`. Mount `../web/public/grids:/grids:ro` |
| `api` | built from `services/Api` (same base) | 8080 | `depends_on: postgres: service_healthy, nats: service_healthy`. Mount `/grids:ro` |
| `engine-worker` | built from `engine-worker/` (final stage `node:24.<x>-slim`) | — | `depends_on: postgres: service_healthy, nats: service_healthy`. Mount `/grids:ro`. `stop_grace_period: 30s`. Health check `["CMD","node","-e","fetch('http://localhost:9090/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]`. Can be scaled |
| `geo-pipeline` | built from `data-prep/` (`python:3.12.<x>-slim`) | — | `profiles: ["batch"]`. Mount `../web/public/grids:/out` (read-write) |
| `demo-seed` | `postgres:16.<x>-alpine` (same image) | — | `profiles: ["demo"]`, `depends_on: postgres: service_healthy`, environment `PGUSER`/`PGPASSWORD`/`PGDATABASE` from `.env`. Mounts `infra/demo/` at `/demo` and runs `psql -h postgres -f /demo/load.sql` |

- **No compose health checks for `api` and `ingest`.** The `aspnet` image has no curl or wget, and no other service depends on them being healthy. `smoke.sh` checks their readiness endpoints from the host instead.
- Dockerfiles are multi-stage: SDK → `aspnet:10.0.<x>`.
- The engine-worker image is built **from the repo root** (`context: ..`, `dockerfile: engine-worker/Dockerfile`), because `npm ci` needs the root lockfile. It runs `npm ci --omit=dev -w engine-worker -w engine`, so the web dependencies are not installed, and `tsx` is a regular dependency of the worker package.
- `.env.example` lists every variable with its default (`POSTGRES_PASSWORD`, `FOGOS_API_KEY=`, `INGEST_OFFLINE=`, the intervals). `.env` is gitignored.

## Database (`infra/db/001_init.sql`)

```sql
create table snapshots (
  id          bigserial primary key,
  source      text        not null,   -- 'ipma-observations', 'open-meteo', 'fogos-active', ...
  key         text        not null,   -- '' for national files; the domain (grid) name for open-meteo
  fetched_at  timestamptz not null,
  body        jsonb       not null,   -- upstream body (jsonb normalises whitespace and key order; fine for the parsers)
  url         text        not null    -- never contains the fogos key
);
create index on snapshots (source, key, fetched_at desc);

create table source_status (          -- the last attempt per (source, key), for "stale" and backoff
  source text not null, key text not null,
  last_attempt_at timestamptz, last_ok_at timestamptz, last_error text, retry_after timestamptz,
  primary key (source, key)
);

create table runs (
  id          uuid primary key,
  status      text not null check (status in ('queued','running','done','failed')),
  created_at  timestamptz not null default now(),
  started_at  timestamptz, finished_at timestamptz,
  request     jsonb not null,           -- the run-request contract, including grid name and seed
  grid_hash   text,                     -- sha256 of the grid's header.json when the worker loaded it (audit)
  progress    int not null default 0,   -- decisions done: 0, 1 or 2
  result      jsonb,                    -- the run-result contract without the rasters
  error       text,
  attempts    int not null default 0,   -- deliveries started by workers
  worker      text                      -- HOSTNAME of the worker that finished it
);

create table run_rasters (
  run_id   uuid not null references runs(id) on delete cascade,
  decision char(1) not null check (decision in ('A','B')),
  layer    text not null check (layer in ('arrival','probability')),
  data     bytea not null,              -- little-endian Float32, rows*cols*4 bytes
  primary key (run_id, decision, layer)
);
```

- **Retention:** a snapshot is never updated, so the table is the version history of §4.2. The ingest leader deletes snapshots older than **3 days** once an hour, always keeping the newest row per (source, key). 30 days is for a real server; at about 150 MB a day of IPMA observations, it is too much for a laptop. Runs are kept.
- **Reading the latest:** `select id, fetched_at, body from snapshots where source=$1 and key=$2 order by fetched_at desc limit 1`, served by the index.

## Ingest (`services/Ingest`)

- **Project type:** `Microsoft.NET.Sdk.Web` (on the `aspnet` image) with hosted services, so it can also serve `GET /health/ready` → `{ leader: bool, postgres: ok }` on port 8081, published only on the host loopback as `127.0.0.1:8081:8081` so `smoke.sh` can curl it. (The image has no curl, so `docker compose exec` cannot.) With scaled ingest replicas the port mapping would clash, so scaling ingest is done without that mapping (documented in `infra/README.md`).
- **Schedules** (constants in one place; each can be overridden by environment variable):

  | Source | Interval |
  | --- | --- |
  | `ipma-observations` | 10 min |
  | `ipma-warnings` | 10 min |
  | `ipma-rcm-d0` | 1 h |
  | `ipma-stations`, `ipma-districts` | 24 h |
  | `open-meteo` per domain | 15 min |
  | `fogos-active` | 2 min |

  Each source has its own loop (`PeriodicTimer`), so one slow source never delays another.
- **On becoming leader**, every source whose newest snapshot is older than its interval is fetched at once.
- **Backoff and 429 handling:** as in plan-weather (60 s, or `Retry-After`, whichever is longer), but persisted in `source_status.retry_after`, so a restart does not hammer fogos.pt.
- **Validation before insert:** the body must parse with the `Data` parsers and must not be empty. A bad body is recorded in `source_status.last_error` and never inserted.
- **The Open-Meteo lattice.** Open-Meteo answers for points, so ingest pulls a fixed lattice per domain instead of the user's exact click:
  - The domains are the grids listed in `/grids/index.json`, with their `header.json` (bbox from origin, cell size, rows and cols). The bbox is converted to WGS84 with the **`ProjNET` NuGet package**, the only new .NET package in this plan, using an EPSG:3763 transverse Mercator built from the same parameters as `web/src/lib/projection.ts`.
  - For each domain, ingest takes a 3 × 3 lattice of points across the bbox (about 5 km apart for Guimarães) and makes **one** request with comma-separated `latitude`/`longitude` lists. The response is a JSON array, stored as one snapshot with `key = <domain>`.
  - The API answers a point with the nearest lattice point. This removes the plan-weather "same 0.01° bin" offline limitation: any point in the domain has model data.
  - `// ponytail: 3×3 per domain; national coverage needs a coarse national lattice or ECMWF grids (§4.1)`.
- **Leader lock (`Data/LeaderLock.cs`):**
  - Open **one dedicated connection** with `Pooling=false;Keepalive=30` and run `select pg_try_advisory_lock(hashtext('linha-zero-ingest'))` on it. Keep the connection open for the life of the process. A pooled connection would lose the lock: Npgsql resets returned connections with `DISCARD ALL`, which releases advisory locks.
  - Not the leader: retry every 30 s.
  - Leader: run `select 1` on that connection every 30 s. If it fails, stop all loops at once (leadership lost), dispose the connection, and go back to retrying.
  - Only the leader runs the pull loops and the retention cleanup.
- **Offline mode:** `INGEST_OFFLINE=1` makes the loops skip fetching. That is all; the API keeps serving the newest snapshots.

## API (`services/Api`)

All JSON uses camelCase; times are ISO 8601 UTC with `Z`. Everything is under `/api/v1`, so the Vite proxy (`/api` → `http://localhost:8080`) reaches all of it, health included.

| Endpoint | Behaviour |
| --- | --- |
| `GET /api/v1/weather?lat&lon` | Response exactly as the `plan-weather` contract. It reads the newest snapshot of each source (queries in parallel) and runs the same pure selection functions with each snapshot's `fetched_at` as `asOf`. Parsed snapshots are memoised by row `id` (immutable, so this is not hidden state). `stale` = the snapshot is older than 2× its interval, or `source_status.last_error` is newer than `last_ok_at`. Outside every domain there is no `model`; if there is also no qualifying IPMA station → 503 as in plan-weather |
| `GET /api/v1/incidents/active?bbox` | As in plan-weather, from the newest `fogos-active` snapshot |
| `POST /api/v1/runs` | Body: run-request (below), capped at 1 MB. Validation → 400 with a Portuguese message: the grid exists in `/grids`; `ensemble.runs` 1–500; `durationMin` 60–480; `wind.speedMs` 0–20; `wind.directionDeg` 0–359; the ignition is inside the grid; at most `rows × cols` cells per intervention and 50 interventions per decision. Then: insert the `runs` row (`queued`) and publish to `runs.jobs` with `Nats-Msg-Id = runId`. **If the publish fails**, set the row to `failed` (`error = 'fila indisponível'`) and return 503; the web then falls back to the browser. `Nats-Msg-Id` only drops a duplicate of the same publish within JetStream's 2-minute window; it protects nothing else. Success → `202 { runId }` + `Location` |
| `GET /api/v1/runs/{id}` | Status, progress (0–2), error, and the result when done |
| `GET /api/v1/runs/{id}/events` | SSE via `TypedResults.ServerSentEvents`. Order matters, to avoid losing a `done` that happens at connect time: (1) **subscribe** to core NATS `runs.<id>.events`; (2) **then** read the row; (3) if the row is `done` or `failed`, send that one event and close; otherwise send a `progress` event with the row's state (including `status`, so `queued` is distinguishable from `running`), then forward NATS events until `done`/`failed`, then close. Heartbeat: an `event: ping` with empty data every 15 s, which the client ignores (`SseItem<T>` has no comment lines) |
| `GET /api/v1/runs/{id}/rasters/{decision}/{layer}` | `decision` ∈ `A`/`B`, `layer` ∈ `arrival`/`probability`. Returns the `bytea` as `application/octet-stream` with `Cache-Control: public, max-age=31536000, immutable`, since results never change |
| `GET /api/v1/health` | `{ postgres, nats, idleWorkers }`: `idleWorkers` = the `num_waiting` (waiting pull requests) of the `engine` consumer, from consumer info. A worker busy inside `simulate` is not counted, which is why the web uses a 60 s window (Web §2). 200 if Postgres and NATS are up, even with `idleWorkers = 0`, so the web can tell "no workers" apart from "API down" |

- **The stream at start-up:** the API ensures the `RUNS` stream exists before it accepts requests. It uses an idempotent add with the same config as the worker, and retries every 2 s until NATS answers (`depends_on` only waits for the container to be healthy, not for JetStream to be ready).

## NATS

- **Stream `RUNS`:** subjects **exactly `["runs.jobs"]`**, retention `workqueue`, storage file, duplicate window 2 min.
- **Durable pull consumer `engine`:** `ack_policy: explicit`, `ack_wait: 60s`, `max_deliver: -1` (the worker decides when to give up; see below).
- **Progress and completion events** go to `runs.<id>.events` on **core NATS** (not stored). They are not in the stream, so they never pile up in a work queue nobody consumes. Missing one is harmless, because the SSE endpoint reads the row state on connect.
- The stream and the consumer are created idempotently by **both** the API (stream only) and the worker (stream + consumer), with identical config, retrying until NATS is up.

## Engine worker (`engine-worker/`)

- An npm workspace depending on `@linha-zero/engine`.
- Dependencies: `nats` (the official client), `pg`, and `tsx` (it runs the TS directly, as the engine scripts already do). These are the only new npm dependencies of this plan.
- **Grids** are read from `/grids/<name>/` with `fs`. **Copy every layer into its own `ArrayBuffer`** before decoding: `buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)`. A Node `Buffer` can be a slice of a shared pool, and `decodeGrid` builds typed arrays on the whole `arrayBuffer`. Loaded grids are kept in a map keyed by name + sha256 of `header.json` (the grid hash), at most 4.
- **Pull loop:** `while (!stopping) { const msg = await consumer.next({ expires: 10_000 }); ... }`. That is **one message at a time**, so a busy worker never holds jobs another worker could take. (The default `consume()` buffers up to 100 messages.) The short `expires` makes a stopped worker vanish from `idleWorkers` within 10 s. If a message arrives after SIGTERM, `nak` it at once.
- **`simulate` is synchronous.** One decision blocks the event loop for about 4 s at 200 runs, and about 10 s at the 500 cap, on a 200 × 200 grid (from `npm run bench`). So nothing time-based can run during it. Instead:
  - call `msg.working()` **before each decision**;
  - `ack_wait` of 60 s is far above the longest decision;
  - SIGTERM is handled between decisions (see below), within `stop_grace_period: 30s`;
  - `/healthz` on port 9090 may answer late during a decision, so the compose health check uses `interval: 30s, timeout: 15s, retries: 3`.
  - `// ponytail: one blocking job per process; worker_threads or per-run yielding needs an onRun hook in simulate (engine change)`.
- **Job steps:**
  1. Parse the job and load the row.
     - Row is `done` or `failed`: ack and stop (idempotency).
     - `attempts >= 3`: mark it `failed` ("falhou 3 vezes"), publish `failed`, `term`, stop. This covers workers that crash, which `max_deliver` alone would leave stuck in `running` for ever.
  2. `update runs set status='running', started_at=coalesce(started_at, now()), attempts=attempts+1, worker=$host where id=$1 and status in ('queued','running')`, then publish `{type:"progress", status:"running", done:0, total:2}`.
  3. Load the grid and store `grid_hash`.
  4. For A, then B:
     - `msg.working()`;
     - `buildScenario`-equivalent: the request already has engine-ready interventions, so it is `{ ignition, wind, durationMin, interventions: decisions[d], ensemble }`;
     - run `simulate`;
     - `update runs set progress=<1|2>`, and publish `{type:"progress", status:"running", done, total:2}`;
     - check for a pending SIGTERM: if set, `nak` and exit.

     A and B use **the same ensemble options, seed included**, which is the pairing contract in `engine/src/simulate.ts`.
  5. In **one transaction**: insert the 4 `run_rasters` rows (`on conflict do nothing`) and `update runs set status='done', result=$r, finished_at=now(), progress=2, worker=$host where id=$1 and status <> 'done'`. A late duplicate then changes nothing.
  6. Publish `{type:"done"}`, then `ack`.
- **On an exception:** `nak` with a 5 s delay. The next delivery's step 1 counts the attempt; after 3 the row becomes `failed`.
- **SIGTERM:** set a flag, stop pulling, and finish the current decision (step 4 then `nak`s). Exit 0.

## Contracts

`engine/src/contracts.ts` (types only) and `contracts/examples/*.json`.

`run-request` (`runId` is **not** sent by the client; the API sets it in the job message and the row):

```jsonc
{
  "grid": "guimaraes",
  "ignition": { "row": 103, "col": 92 },
  "wind": { "directionDeg": 45, "speedMs": 2.5 },
  "durationMin": 240,
  "ensemble": { "runs": 200, "windDirJitterDeg": 20, "windSpeedJitterPct": 25, "seed": 2035 },
  "decisions": { "A": [ /* engine Intervention[], rasterised to cells by the browser */ ], "B": [] },
  "weather": { "source": "ipma", "station": "Braga, Merelim", "observedAt": "...", "fetchedAt": "..." }  // optional provenance
}
```

The browser already rasterises interventions (`toEngineIntervention` in `web/src/lib/scenario.ts`). Sending engine-ready cells keeps the worker free of projection code and guarantees the server runs exactly what the browser would. The cost is a request of about 10–50 KB.

`run-result` (stored in `runs.result`). The worker returns only what the engine returns; **`paired` and `likelyHa` are computed in the browser**, by the same code path as local results:

```jsonc
{
  "durationMin": 240,
  "rows": 157, "cols": 152,                                       // so the browser can check the raster sizes
  "A": { "metrics": { /* engine Metrics */ }, "runs": [ /* RunMetrics[] */ ] },
  "B": { "metrics": { }, "runs": [ ] },
  "elapsedMs": 8123
}
```

`run-event`: `{ "type": "progress", "status": "queued" | "running", "done": 0..2, "total": 2 }`, `{ "type": "done" }` or `{ "type": "failed", "error": "..." }`.

- **C#** has records only for what it reads: the validated fields of `run-request` (grid, ignition, wind, durationMin, ensemble, and the cell counts per decision). The rest is passed through as `JsonElement`. `run-result` is stored and returned as an opaque `JsonElement`.
- **Tests:** both sides deserialize every `contracts/examples/*.json` into their types and fail on a missing required field. The TS side also type-checks the examples (`satisfies RunRequest` in a test file).

## Web changes

1. **Proxy:** `/api` → `http://localhost:8080` (it replaces the plan-weather `:5080`). Paths change to `/api/v1/weather` and `/api/v1/incidents/active`. The behaviour of the weather card and the incident markers does not change.
2. **Where the ensemble runs:**
   - Saved scenarios keep `ensemble: boolean`. Nothing changes in `SavedScenario`, `parseSavedScenario` or `buildScenario`.
   - New UI state `ensembleWhere: "browser" | "server"`, **not saved**, included in `inputKeyOf` (and so in `SimInputs`).
   - Shown as a small select next to the uncertainty checkbox: `no browser (30)` | `no servidor (200)`.
   - `no servidor` is enabled while some `GET /api/v1/health` in the **last 60 s** answered with `idleWorkers >= 1`. Health is checked on page load and every 15 s while the select is visible. The window stops the option flickering off while the only worker is busy computing.
   - The pending-scenario auto-run (`?scenario=`) builds `SimInputs` too, and passes the current `ensembleWhere`.
   - The checkbox label and the result message stop hard-coding `ENSEMBLE.runs`. They use the runs of the chosen mode: "Simulação no servidor: 2×(200+1) corridas em 8 123 ms".
3. **Server flow** (`web/src/lib/serverRun.ts`):
   1. `POST /api/v1/runs` with `ensemble = { ...ENSEMBLE, runs: 200 }`.
   2. Open an `EventSource` on `/events`. Show "A simular no servidor: 1/2".
   3. On `done`: **`es.close()`** (otherwise `EventSource` reconnects for ever). Fetch the run and the 4 rasters. Check that `result.rows`/`cols` equal the **loaded `grid.header`** (which catches a different grid) and that each raster is `rows × cols × 4` bytes, and build two `SimulationResult` objects (`arrivalMin` and `burnProbability` from the rasters; `metrics` and `runs` from the result).
   4. Pass them into the same results path as local runs, so `likelyHa`, `paired`, the maps and `ComparisonPanel` need no change.
   5. On `failed`: `es.close()`, then fall back.
4. **Fallback to the browser.** Run locally with 30 runs and the message "Servidor indisponível; a simular no browser (30 corridas)" when any of these happens:
   - the POST fails (network error, non-JSON reply, or 503);
   - no event with `status: "running"` arrives within **20 s** of the POST (for example, no worker running; the `queued` state sent at connect does not count);
   - there is no `done` within **120 s**;
   - `EventSource.onerror` fires, followed by a `GET /api/v1/runs/{id}` that shows no progress.

   In each case the stream is closed first. **The demo can never get stuck on the server.**
5. **Pitch note** (in `infra/README.md`): 200 runs on the server take about 8 s, which a laptop browser could also do. The point of the server path is the architecture: many incidents at once, scaling by adding workers, and an audit trail. It is not "faster for one user".

## Geospatial pipeline (`data-prep/Dockerfile`)

- `python:3.12.<x>-slim` + `pip install -r requirements.txt`. The `rasterio`, `geopandas` and `pyproj` wheels bundle GDAL, so no GDAL base image is needed. Entrypoint: `python build_grid.py`.
- Usage: `docker compose -f infra/docker-compose.yml run --rm geo-pipeline <build_grid.py args> --out /out/<name>`. The grid lands in `web/public/grids/<name>/`, and the browser and every service see it at once through the mounts. The `index.json` update stays as `data-prep/README.md` describes today.
- It stays a batch job with no service of its own (§5.1: "corre por mês ou por ano").

## Offline demo

Two layers, so a failure in one never stops the demo:

1. **No Docker at all:** the web app works exactly as today. Single runs and the 30-run ensemble happen in the browser. The weather button shows "indisponível".
2. **Docker without internet:**
   - **Record** (online, on a windy day, after `ingest` has run at least one full cycle): `docker compose -f infra/docker-compose.yml exec -T postgres psql -U ... -c "\copy (select source, key, fetched_at, body, url from (select distinct on (source, key) * from snapshots order by source, key, fetched_at desc) s) to stdout csv header" > infra/demo/snapshots.csv`. This is only the newest row per (source, key), a few MB, not the whole history, and **without `id`**. `-T` turns off the pseudo-terminal, which would otherwise add carriage returns and corrupt the CSV.
   - **`infra/demo/load.sql`:** `\copy snapshots(source, key, fetched_at, body, url) from '/demo/snapshots.csv' csv header`. New ids come from the sequence, so loading into the recording machine's database never conflicts. A duplicate row is harmless: the newest one per (source, key) stays the same.
   - **Load:** `docker compose -f infra/docker-compose.yml --profile demo run --rm demo-seed`.
   - **Run:** set `INGEST_OFFLINE=1` in `infra/.env` (this works on every shell, Windows included; compose maps it with `INGEST_OFFLINE: ${INGEST_OFFLINE:-}`), then `npm run up:offline`. The API serves those snapshots, labelled "Vento de há N dias (sem ligação)" as in plan-weather. Server ensembles still work, because the grids are local.
   - **Pre-demo checklist** (in `infra/README.md`): with the network on, run `npm run up` once, so images are pulled and built. Offline, use only `up:offline`, which never builds.

## Scripts (root `package.json`)

| Script | Command |
| --- | --- |
| `up` | `docker compose -f infra/docker-compose.yml up -d --build` |
| `up:offline` | `docker compose -f infra/docker-compose.yml up -d --no-build` |
| `down` | `docker compose -f infra/docker-compose.yml down` (keeps the volumes; add `-- -v` after a schema change) |
| `logs` | `docker compose -f infra/docker-compose.yml logs -f` |
| `test:services` | `dotnet test services` |
| `test:worker` | `npm run test -w engine-worker` (Vitest, like the engine) |

`npm run test` stays engine-only. The plan-weather scripts `dev:ingest`, `dev:ingest:demo` and `test:ingest` are removed, and the README is updated.

## Tests

**`services/Tests`:**
- All plan-weather tests, moved.
- **Postgres tests** run against the compose Postgres when `TEST_PG` is set; otherwise they are skipped with a visible message (no Testcontainers dependency).
  - `SnapshotsTests`:
    1. Insert, then read the latest.
    2. Retention keeps the newest row per (source, key).
    3. `source_status` makes `stale` true when the newest error is later than the last success.
  - `LeaderLockTests`: two `LeaderLock` instances; exactly one is leader; after the leader's connection is disposed, the other becomes leader within one retry period (the test uses a 1 s period).
- `LatticeTests`:
  - the Guimarães grid corners match the browser's `gridCorners` output within 1e-5°, with the values copied into a fixture once from the browser code;
  - 3 × 3 points inside the Guimarães bbox;
  - a point picks its nearest lattice point;
  - a point outside every domain → no model.
- `ContractsTests`: every `contracts/examples/*.json` deserializes into the C# records.
- `RunsValidationTests`: unknown grid, runs out of range, `durationMin` out of range, wind out of range, ignition outside the grid, too many cells → 400. The validation is a pure function `Validate(request, gridHeader)`, so this needs no fakes.

**`engine-worker/test/job.test.ts`** (Vitest, no NATS or Postgres: `job.ts` takes a grid and a request and returns the result plus the 4 rasters):
1. Same request → identical result twice (determinism).
2. Identical decisions → `comparePaired(A.runs, B.runs, key)` gives `ties === runs` and `bBetter === aBetter === 0` (the field names in `engine/src/metrics.ts`, which are counts, not fractions).
3. The result type-checks against `RunResult`, and `contracts/examples/run-result.json` has the same keys.
4. Each raster is `rows × cols × 4` bytes.
5. Grid loading from a `Buffer` with a non-zero `byteOffset` decodes correctly (the pool-slab case).

**End-to-end smoke (`infra/smoke.sh`)**, run by hand and listed in "Done when":
1. `npm run down -- -v && npm run up`.
2. Wait for `GET /api/v1/health` with `idleWorkers >= 1`, and for `curl 127.0.0.1:8081/health/ready` to show `leader: true`.
3. `curl` weather, and check `model` or `observed` is filled in (needs network, or the demo seed).
4. `POST` the example run request.
5. Follow the SSE stream until `done`.
6. Fetch one raster and check its size.
7. Scale out: `docker compose up -d --scale engine-worker=3`, post 6 runs, wait until all are `done`, and check that `runs.worker` has more than one distinct value.
8. Redelivery: post one 500-run job. Once its row is `running`, read `runs.worker` (the container's short id, which is its `HOSTNAME`) and `docker kill <that id>` (SIGKILL). Check that the row ends `done` within `ack_wait` + one run, with a **different** `worker`.

## Docs

- `docs/decisoes.md`: one entry per row of the deviations table, plus:
  - "Rede de pontos do Open-Meteo por domínio" (Open-Meteo point lattice per domain);
  - "Ingestão singleton com advisory lock numa ligação dedicada" (singleton ingest, advisory lock on a dedicated connection);
  - "Um job de cada vez por worker" (one job at a time per worker).
- `README.md`: two ways to run, (a) `npm run dev` only (browser engine, no data services) and (b) `npm run up` + `npm run dev`. Requirements: Docker and Docker Compose; .NET 10 and Node 24 for development outside containers.
- `infra/README.md`: the services, ports, environment variables, scaling commands, the offline-demo procedure, the pre-demo checklist and the pitch note.
- `docs/proposta-tecnica.md` is not edited. Its §5 stays the target; `decisoes.md` records where the hackathon build differs.

## Order of work

| # | Step | Estimate |
| --- | --- | --- |
| 1 | Wait for the plan-weather implementation to finish and pass its checks. **The user commits it**, so the move is a clean diff | — |
| 2 | `infra/` compose with postgres and nats; `001_init.sql`; `.env.example`; check the image tags | 1.5 h |
| 3 | `services/` solution: move `Data` + tests; `Snapshots.cs`, `LeaderLock.cs`, `Grids.cs`; contracts and examples | 3 h |
| 4 | `Ingest`: loops, lattice, leader, retention, health; delete `ingest/` | 3 h |
| 5 | `Api`: weather and incidents on snapshots; runs, validation, SSE, rasters, health | 4 h |
| 6 | `engine-worker`: `job.ts` + tests, then the NATS and Postgres wiring | 3.5 h |
| 7 | Web: proxy, paths, `ensembleWhere`, `serverRun.ts` with timeouts and fallback | 3 h |
| 8 | Dockerfiles, `smoke.sh`, demo seed, docs | 3 h |

Total about 3 working days. **This competes with the rest of the §7.1 week plan** (logistics, critical path, exposed population, the Penha scenario), which then gets about 2 days. If the week runs short, cut in this order: the demo seed (offline layer 1 still works), then smoke steps 7–8, then the geo-pipeline Dockerfile.

## Done when

- `npm run test`, `npm run test:services` (with `TEST_PG` set), `npm run test:worker`, `npm run typecheck`, `npm run lint` and `npm run build` pass.
- `infra/smoke.sh` passes from a clean `down -v`, including the scale-out and redelivery steps.
- In the browser, with `npm run up` + `npm run dev`:
  - the weather button works through the API;
  - "no servidor (200)" shows progress, then the paired comparison with 200 runs;
  - `docker compose stop engine-worker`: within 60 s the server option is disabled, and a run started just after the stop falls back to the browser within 20 s.
- `docker compose stop api`: the web falls back to the browser with the message, and `?scenario=demo` runs as before.
- Wi-Fi off, demo seed loaded, `up:offline`: weather (with its age), the incidents status, and server ensembles all work.

## Out of scope (where it fits later)

| Item | Where it fits |
| --- | --- |
| Rust engine | Replaces `engine-worker/` behind the same `runs.jobs` contract |
| Object storage (S3-compatible) | Grids as COG tiles and result rasters once there is K8s or national grids. Replaces the `/grids` mount and `run_rasters` |
| PostGIS | Switch the image when domains and incidents get geometry columns |
| Keycloak/Entra, roles, visibility, audit log | Middleware in `Api`; `runs` gets `owner`/`entity` columns |
| SignalR shared annotations | A hub in `Api`, fanned out through NATS like the SSE events |
| OSRM | One more compose service; called by the engine worker for logistics |
| OpenTelemetry, Prometheus, Grafana | An OTLP exporter in each service; a collector in compose |
| Kubernetes + KEDA | The compose services map one to one onto Deployments; KEDA scales `engine-worker` on the consumer's pending count |
| Scenarios, domains and incidents in Postgres | The §5.8 `/scenarios` and `/domains` endpoints |
| Per-run progress, non-blocking worker | An `onRun` hook in `engine/src/simulate.ts`, or `worker_threads` |
| Splitting one ensemble across workers | Shard by run index with the same seed (mulberry32 state = seed + n·0x6d2b79f5, so a shard jumps to its runs in O(1)), then merge the counts |
