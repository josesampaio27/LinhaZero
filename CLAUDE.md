# LinhaZero

Web tool for Hack4Guimarães 2035 ("emergency response and rural fires" challenge). It answers the question a rural-fire
coordinator asks in the first minutes: **"If I take decision A or decision B, what happens to the fire over the next
hours?"** Two synchronized maps, one per decision; the engine simulates the fire with no suppression except what the user
draws (containment lines, attacks, protected zones), and a paired wind ensemble says in how many scenarios each decision
wins. A grid editor builds grid variants (fuel, barriers, speeds, coefficients) to compare prevention measures.

The UI and engine run fully in the browser, offline. The backend services add live weather, active incidents, large
ensembles, login and access requests. 

## Layout

```
engine/         fire-spread engine, pure TypeScript (min arrival time / Dijkstra on a grid, Rothermel, crown fire, spotting,
                ensemble, metrics), scenario/variant formats, shared contracts (src/contracts.ts); Vitest
web/            React + MapLibre UI (Simulation and Grid editor); engine runs in a Web Worker (src/worker/)
engine-worker/  Node worker running the same engine from the NATS queue, one job at a time
landing/        presentation page (React, 3D hero)
backend/        .NET 10: LinhaZero.Core (DB/Dapper, sources, weather, incidents, grids), LinhaZero.Api (controllers,
                OpenAPI, SSE), LinhaZero.Ingest (IPMA, Open-Meteo, fogos.pt); tests/LinhaZero.Tests (xUnit)
contracts/      JSON examples = source of truth for types shared by UI, API and worker; openapi.json (generated)
infra/          docker-compose (included by root compose.yaml), Caddy, Keycloak realm/themes, SQL init, demo seed, k8s, smoke.sh
data-prep/      Python scripts that build web/public/grids/<zone>/ from real data (FUMOD, Copernicus DEM, OSM)
docs/           all documentation (Portuguese): architecture (arc42), fire model, reference, plan, ADRs, hackathon PDFs
```

Services in compose: `proxy` (Caddy HTTPS), `landing`, `web`, `keycloak`, `api`, `ingest`, `engine-worker`, `mailpit`,
`postgres` (no PostGIS), `nats`. No Redis, no object storage.

## Commands

```bash
docker compose up -d --build   # everything; app at https://app.linhazero.localhost (dev@linhazero.localhost / linhazero-dev)
npm install && npm run dev     # UI only, http://localhost:5173 (proxies /api to :8080 if the services are up)
npm run typecheck              # engine, web, engine-worker, landing
npm run lint                   # ESLint
npm run test                   # engine + web (Vitest)
npm run test:worker            # engine-worker
npm run test:backend           # dotnet test backend (TEST_PG=1 also runs Postgres/NATS tests against compose)
dotnet format backend          # CI runs --verify-no-changes
npm run api:client             # rebuild the API: regenerates contracts/openapi.json and web/src/api/client.ts
infra/smoke.sh --fresh         # end-to-end test of the compose stack
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests, build and the .NET format check + tests on push to `main`
and on PRs.

## Git

- Commit messages are always in English.
- Never push without the user's explicit permission.

## Conventions

- **Language:** docs and user-facing messages in European Portuguese; code and code comments in English. File and folder
  names in Portuguese without accents (in `docs/`).
- **Contracts:** `contracts/examples/*.json` are the source of truth. Both sides' tests deserialize them; no generator.
  `contracts/openapi.json` and `web/src/api/client.ts` are generated (NSwag) — never edit by hand. Times are ISO 8601
  UTC with `Z`; JSON is camelCase.
- **Backend style** (see `backend/README.md`): plain ASP.NET Core pieces (controllers, typed `HttpClient`s,
  `IOptions<T>`, Dapper with hand-written SQL, System.Text.Json classes); concrete singleton classes, interfaces only with
  more than one implementation; descriptive names; records over tuples; early returns; comments say *why*.
- **Migrations:** `backend/src/LinhaZero.Core/Database/Migrations/NNN_*.sql`, applied by the API on start (ADR 0065).
  `infra/db/` scripts only run on an empty database.
- **Docs as code:** update docs in the same commit as the code they describe. Status words: *feito* / *hackathon* /
  *planeado*. Decisions go in a new ADR under `docs/decisoes/`; an accepted ADR is superseded, never rewritten.
- Formatting: Prettier (default config) for JS/TS.

## Where to read more

- `README.md` — how to run and use the app
- `docs/README.md` — documentation index
- `docs/arquitetura/` — architecture (start with `04-estrategia.md`, `05-blocos.md`)
- `docs/modelo/o-motor-explicado.md` — the engine end to end; `validacao-resumo.md` — validation on 80 real fires
- `docs/referencia/` — grid, scenario and variant formats, API, database, data sources
- `docs/decisoes/README.md` — ADR index
- Engine coefficients live in `engine/src/params.ts` (calibrated against PT-FireSprd; reports in `engine/reports/`)
