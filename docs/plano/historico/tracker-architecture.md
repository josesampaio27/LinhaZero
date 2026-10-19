# Tracker: microservices architecture (plan-architecture.md)

Branch: `microservices` · Base commit: `de5d58e` (live weather)

Status: ⬜ to do · 🔄 in progress · ✅ done (implemented and checked) · 🔍 under review · 🛠 fixing review findings · ❌ blocked

**Nothing is committed until the final review passes.** All work stays in the working tree.

## Implementation

| # | Step | Status | Notes |
| --- | --- | --- | --- |
| 1 | Base: weather work committed on `microservices` | ✅ | `de5d58e` |
| 2 | `infra/`: compose with postgres + nats, `001_init.sql`, `.env.example`, image tags checked | ✅ | `infra/docker-compose.yml`, `infra/db/001_init.sql`, `infra/.env.example`; postgres:16.12-alpine, nats:2.10.29-alpine, sdk 10.0.402 → aspnet 10.0.13, node:24.13.0-slim, python:3.12.12-slim (all amd64+arm64); ports 5432/4222/8222/8080/8081 free; 4 tables created |
| 3 | `services/`: Data + tests moved, `Snapshots.cs`, `LeaderLock.cs`, `Grids.cs`, contracts + examples | ✅ | `services/LinhaZero.slnx`, `services/Data/{Weather,Incidents,Snapshots,LeaderLock,Grids}.cs`, `contracts/examples/*.json` + `contracts/README.md`, `engine/src/contracts.ts`; `dotnet test services`: 39 passed + 4 skipped (no TEST_PG), 43/43 with TEST_PG=1 |
| 4 | `Ingest`: loops, Open-Meteo lattice, leader lock, retention, health; `ingest/` deleted | ✅ | `services/Ingest/{Program,Puller}.cs`; in compose: leader, one loop per source, Open-Meteo 3×3 lattice per grid, 429 → `source_status.retry_after` (fogos.pt gave 429 with Retry-After 3600 in the Docker run), `/health/ready` on 127.0.0.1:8081, `INGEST_OFFLINE=1` verified; `ingest/` removed (`git rm`) |
| 5 | `Api`: weather + incidents on snapshots, runs, validation, SSE, rasters, health | ✅ | `services/Api/{Program,Runs}.cs` (NATS.Net 3.3.1); verified locally: weather (observed Merelim + lattice model, Lisbon → no model), incidents, 400/202/503 paths, SSE queued→running→done with pings, raster 95 456 B + immutable cache header, health idleWorkers |
| 6 | `engine-worker`: `job.ts` + tests, NATS + Postgres wiring | ✅ | `engine-worker/src/{main,job,db}.ts`, `test/job.test.ts` 5/5; ran 4 jobs locally (idempotent finish, grid_hash, worker column) |
| 7 | Web: proxy, `/api/v1` paths, `ensembleWhere`, `serverRun.ts` with timeouts + fallback | ✅ | `web/vite.config.ts` (→ 8080), `web/src/lib/{weather,serverRun}.ts`, `web/src/App.tsx`; typecheck, lint, build pass; proxy verified from a Vite on :5199 (browser click-through left for the user) |
| 8 | Dockerfiles, `smoke.sh`, demo seed, docs | ✅ | `services/{Api,Ingest}/Dockerfile`, `engine-worker/Dockerfile`, `data-prep/Dockerfile`, `infra/smoke.sh` (8 steps, SMOKE OK from `down -v`), `infra/demo/{load.sql,snapshots.csv}` (8 rows, 1.1 MB), `infra/README.md`, `README.md`, `docs/decisoes.md` (+13 entries) |

## Verification (by the implementing agent)

| Check | Status | Result |
| --- | --- | --- |
| `npm run test` / `typecheck` / `lint` / `build` | ✅ | round 2 re-run: test 18/18; typecheck clean (engine, web, engine-worker); eslint clean; vite build OK (3.7 s) |
| `npm run test:worker` | ✅ | round 2: 8/8 (typed contract literals vs every run-*.json, determinism, paired ties, RunResult keys, raster sizes, layer hash, byteOffset slab) |
| `npm run test:services` (with and without `TEST_PG`) | ✅ | round 2: without: 47 passed, 5 skipped ("TEST_PG não definido: testes Postgres saltados"); with `TEST_PG=1`: 52/52 incl. SSE-after-ping and leader failover |
| `infra/smoke.sh` from clean (incl. scale-out + redelivery) | ✅ | round 2 (rebuilt images, non-root, restart policies, loopback ports): SMOKE OK; step 7: 3 distinct workers (2+2+2); step 8: killed while `running attempts=1` → `done|2|71c04609a740` |
| Through the Vite proxy: health, weather, POST run + SSE | ✅ | round 2 on :5199: health 200 JSON; weather observed Merelim 3.5 m/s + model + 6 h forecast; POST 202; SSE running 0/2 → 1/2 → 2/2 → done. Also: `windDirJitterDeg: 1e308` → 400; null grid → 400; duplicate key → 400 (nothing inserted); cell (-5, 99999) → 400; NATS stopped → 503 in 11 ms |
| Worker stopped → stream stays `queued`; API stopped → non-JSON | ✅ | round 2: worker stopped, POST, SSE held 42 s (queued + 2 pings), worker started → `running 0/2`, `1/2`, `2/2`, `done` all delivered (A1 fixed). API stopped: Vite `500 text/plain`, empty body. `restart postgres`: worker restart count 0, ingest re-elected itself and kept pulling, API failed one health call then 200, a run completed |
| Offline demo seed: record, `down -v`, load, stale weather answers | ✅ | round 2: seed re-recorded from a full live Docker cycle (~15:15 UTC, 8 rows incl. a real fogos.pt 200 with 10 incidents); `down -v` → `INGEST_OFFLINE=1 up` → empty DB 503 → `demo-seed` COPY 8 → weather/incidents answer from the seed (stale flags flip at 2× each interval), server ensemble done. Re-record on a windy day |
| Web without Docker: `?scenario=demo` unchanged | 🔄 | engine demo-scenario tests pass and the web path for local runs is untouched; the browser click-through (`?scenario=demo` with services stopped, and the "no servidor (200)" option + fallback) is left for the user |

## Independent review (separate reviewer agent)

| Round | Status | Findings | Fixed |
| --- | --- | --- | --- |
| 1 | 🔍 | Two reviewers in parallel: (A) .NET services + infra + DB, runs the stack; (B) engine-worker + web + contracts. **B done: 7 required** — worker crashes with no catch/restart policy; pg pool has no `error` listener (Postgres restart kills workers); grid hash covers only header.json (stale grid after rebuild); web has no run token (slow server result lands on wrong grid or newer run); spurious "stale" mark from `ensembleWhere` when no ensemble; TS contract tests check nothing (`any satisfies`); `.prettierignore` lost `web/public/grids/`. Perf claim verified OK (every run computed; Guimarães burns little). **A done: 7 required** — SSE loses an event after every ping (a `done` can be lost); POST /runs hangs 2+ min with NATS down and ignores the publish ack; null fields / duplicate keys → 500 and an orphan `queued` row; ensemble jitters not validated (`1e308` hangs every worker, cells outside the grid accepted); one DB error kills an ingest loop for good while it stays leader; all images run as root; Postgres/NATS exposed on all interfaces with default credentials. Total round 1: **14 required** | ✅ all 14 + 9 nits fixed and re-verified by the implementer (smoke OK, SSE no longer loses events, NATS down → 503 in 11 ms, `1e308` → 400, Postgres restart survived) |
| 2 | 🔍 | Same two reviewers re-check their findings and the new diffs. **B done:** B1–B3, B5–B7 confirmed fixed; worker error paths never ack an unfinished job. **1 required (R1):** the B4 fix leaves `busy` stuck true after a grid switch or a scenario load mid-run (button stuck on "A simular…"). Nits: unguarded `onProgress`, a weak grid-hash test. **A done:** A1, A2, A4–A7 confirmed on the rebuilt stack (SSE across 4 pings, NATS down → 503 in 8 ms, non-root, loopback ports); **1 required:** a `null` element inside a list in POST /runs → 500. Total round 2: **2 required** | ✅ both fixed + nits; re-verified (smoke OK, services 53/53, worker 8/8, null-element POSTs → 400) |
| 3 | 🔍 | Same two reviewers: confirm R1/R2 and check the new diffs. **B: APPROVED** (R1 traced for every case; hash test proven to fail against a header-only hash). **A: APPROVED** (null-element POSTs → 400 on the rebuilt stack, smoke OK, services 53/53) | ✅ no required findings |

## Ready to commit

✅ **Ready to be committed** (2026-10-17). Review round 3 had no required findings from either reviewer. Checks re-run by the coordinator on the final tree: engine 18/18, worker 8/8, services 48 passed + 5 skipped (53/53 with `TEST_PG`, run by reviewer A), typecheck, lint and build clean; smoke OK (reviewer A). No `.env`, cache or secrets in the tree.

Still manual, and not blocking the commit: a browser click-through ("no servidor (200)" and its fallbacks, `?scenario=demo` without services); re-record `infra/demo/snapshots.csv` on a windy day; add `FOGOS_API_KEY` when it arrives.

## Log

- 2026-10-17: tracker created; implementation agent started.
- 2026-10-17: coordinator ruled: no commits; all work stays in the working tree. Step 2 started.
- 2026-10-17: Docker Hub 429 on first pull (anonymous quota spent by the manifest checks); cleared after a few minutes. Step 2 done, step 3 started.
- 2026-10-17: deviation: the API needs a .NET NATS client (publish jobs, SSE subscription, consumer info); the plan lists none. Adding the official `NATS.Net` package rather than hand-rolling the wire protocol.
- 2026-10-17: steps 3–6 implemented and exercised locally (Ingest, Api, worker running outside Docker against compose Postgres/NATS). fogos.pt answered 200 without a key on the first pull. Step 7 started.
- 2026-10-17: step 8 of smoke.sh: every permitted job finishes in under 1 s on these grids (the plan assumed ~10 s), so a timing-based kill is unreliable; the test now throttles the single worker to 5% CPU (`docker update --cpus 0.05`), which makes the heaviest job take ~8 s, then kills it mid-job. Redelivery verified (attempts 2, different worker).
- 2026-10-17: fogos.pt behaviour: 200 without a key on the first local pull (14:13 UTC), 429 + Retry-After 3600 on the Docker pull (14:32 UTC); backoff persisted in source_status.retry_after as planned. The demo seed's fogos row is the real 13:26 UTC fixture, inserted by hand.
- 2026-10-17: LeaderLock got a lock-name parameter (default unchanged) so the Postgres test does not compete with the running ingest.
- 2026-10-17: worker container runs `node --import tsx` directly (PID 1 is the worker), so SIGTERM reaches it; `compose stop` finishes in ~3 s.
- 2026-10-17: all verification done except the browser click-through; stack stopped with `npm run down` (volumes kept). Work is implemented and verified, NOT yet reviewed, nothing committed.
- 2026-10-17: review round 1: NOT approved, 14 required fixes (A1–A7, B1–B7) + nits. Fixing on the working tree, no commits.
- 2026-10-17: fixes A1–A4 (services/Api/Runs.cs, Program.cs): SSE keeps one pending read on sub.Msgs (no channel/pump), heartbeat parameterised + test; POST 503 at once when NATS not Open, 5 s publish budget, ack.EnsureSuccess, logged; single Runs.Parse (JsonNode → records, RespectNullableAnnotations, duplicate keys rejected) with Portuguese 400s; jitters 0–180/0–100, non-finite numbers, cells/startMin/rateFactor validated; tests added. Orphan queued rows from the review marked failed.
- 2026-10-17: fixes A5–A7 + nits: per-tick try/catch in the ingest loops; USER $APP_UID / USER node in the images; Postgres and NATS bound to 127.0.0.1; `, id desc` tie-breaks; volatile IsLeader; /health never 500s; bbox NaN/Infinity → 400; .dockerignore **/.env; smoke.sh pipefail fix + python3 documented.
- 2026-10-17: fixes B1–B7 + nits: worker pull loop try/catch + 2 s pause, parse inside try (term on bad message), safe nak, restart: unless-stopped; pool.on("error"); grid loaded per job with hash of header + layers (decisoes.md entry); run token in App.runSimulation; inputKey ignores ensembleWhere unless ensemble; typed contract literals in job.test.ts; web/public/grids/ back in .prettierignore; startRun false → ack; final UPDATE requires status='running'; serverRun parses events safely, CLOSED → fallback, 400 → "Pedido inválido: …".
- 2026-10-17: round 2 verification complete (all items above re-run on the rebuilt stack); `npm run down` with volumes kept. Implemented and verified, NOT reviewed, nothing committed.
- 2026-10-17: review round 2: 13/14 confirmed, 2 required (R1 busy stuck after an abandoned run; R2 null list elements → 500) + nits. Fixed: setBusy(false) at both runSeq bumps, null interventions/cells rejected first in Validate (tests), onProgress guarded, flip-one-byte hash test, Ingest catch filters, test parentheses, decisoes.md CLOSED note, TEST_PG/NATS note. No commits.
- 2026-10-17: round 3 verification: test 18/18, typecheck/lint/build clean, test:worker 8/8, test:services 48+5 skipped / 53 with TEST_PG, smoke --fresh SMOKE OK, both null-element POSTs → 400 (no 500, no row), leftover queued rows cleared (0), `npm run down` with volumes kept. Implemented and verified, NOT reviewed, nothing committed.
