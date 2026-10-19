# Plan: live weather ("Usar o tempo de agora") and active incidents

Goal: one click fills the wind with real data for the ignition point and shows where it came from, how old it is, the fire-risk level and any IPMA warning. A second toggle shows active incidents from fogos.pt on the maps, and clicking one sets the ignition there.
The demo must keep working with no network.

Corresponds to priority 1, "Ingestão .NET mínima", in `docs/proposta-tecnica.md` §7.1.

## Design rules (from proposta-tecnica §5.1)

- **The engine never calls APIs.** `engine/` does not change. The browser calls the ingestion service, turns the answer into a `Wind`, and runs the simulation as it does today.
- **A failure upstream never breaks a simulation.** The service keeps the last good copy of every upstream response and serves it marked as stale, with its age. If the service is down, the button shows a message and the manual wind sliders keep working.
- **Every number shown has its source and time next to it.**

## What the APIs return (probed on 2026-10-17)

| Source | URL | Findings |
| --- | --- | --- |
| IPMA stations | `api.ipma.pt/open-data/observation/meteorology/stations/stations.json` | GeoJSON list; `properties.idEstacao`, `properties.localEstacao`, `geometry.coordinates` = [lon, lat] |
| IPMA observations | `.../observation/meteorology/stations/observations.json` (~1 MB) | `{ "2026-10-17T11:00": { "<idEstacao>": { intensidadeVento (m/s), intensidadeVentoKM, idDireccVento, humidade, temperatura, ... } } }`, last 24 h, hourly. **Missing = -99.0.** The newest hour was 11:00 at 12:25 UTC, so the lag is about 1.5 h |
| IPMA fire risk (RCM) | `.../forecast/meteorology/rcm/rcm-d0.json` | `{ dataPrev, fileDate, local: { "0308": { data: { rcm: 2 }, latitude, longitude } } }`. Each municipality has a centroid, so the nearest one can be picked without a lookup table |
| IPMA warnings | `.../forecast/warnings/warnings_www.json` | List of `{ idAreaAviso: "BRG", awarenessTypeName, awarenessLevelID: green\|yellow\|orange\|red, startTime, endTime, text }` |
| IPMA districts | `api.ipma.pt/open-data/distrits-islands.json` | `data[]` with `idRegiao`, `idAreaAviso`, `local`, `latitude`, `longitude` (strings) of listed places (more than district capitals) |
| Open-Meteo | `api.open-meteo.com/v1/forecast?latitude&longitude&current=...&hourly=...&wind_speed_unit=ms&timezone=UTC&forecast_hours=7` | `current` (15-min) and `hourly` arrays; `hourly` starts at the current hour. Direction in degrees FROM, speed in m/s |
| fogos.pt | `api.fogos.pt/v2/incidents/active` | **HTTP 429 `rate_limit_exceeded` on the first request, `Retry-After: 3600`**, "authenticate with an API key". Access is requested at `https://api.fogos.pt/api/request-access`. Response schema not seen yet |

Real case that shapes the selection rule: the IPMA station **"Guimarães" (3.3 km from the centre) reports wind = -99**. The nearest valid one is **"Braga, Merelim" (18.6 km)**, 2.6 m/s from NE. At the same moment Open-Meteo gave 4.7 m/s from E (92°).

## Scope

In scope:
1. A minimal .NET service `ingest/` with `GET /api/weather` and `GET /api/incidents`, and a file cache.
2. The "Usar o tempo de agora" button, the weather card and the next-6-hours forecast line (information only).
3. A toggle that shows fogos.pt incidents on both maps; clicking one sets the ignition.
4. An offline/demo mode that serves a recorded cache.
5. Weather provenance stored in saved scenarios.

Out of scope (later):
- Wind that changes hour by hour inside the engine. The engine takes one wind; the forecast is only displayed.
- Humidity and FFMC in the spread model. Humidity is displayed and labelled "ainda não entra no modelo" ("not yet used by the model").
- NASA FIRMS and EFFIS, a scheduler (Quartz.NET), Polly, a database, authentication, a shared schema or code generation for the types.
- RCM for tomorrow (`rcm-d1`), and warnings for other areas.

## Prerequisites (step 0, before any code)

1. **Install the .NET 10 SDK (LTS).** It is not on this machine (`dotnet: not found`). Add the requirement to the README.
2. **Request a fogos.pt API key** at `https://api.fogos.pt/api/request-access`. It may take days, so do it first. Find out the header the key goes in.
3. **Record fixtures.** `curl` each URL above into `ingest/Ingest.Tests/fixtures/` (`stations.json`, `observations.json`, `rcm-d0.json`, `warnings_www.json`, `distrits-islands.json`, `open-meteo.json`, `fogos-active.json` once a key works). Before writing any parser, confirm against these files:
   - the `idDireccVento` code table (expected: 0 = no direction or calm, 1 N, 2 NE, 3 E, 4 SE, 5 S, 6 SW, 7 W, 8 NW, 9 N);
   - that observation keys are **UTC**. Check one station's temperature against Open-Meteo at the same UTC hour;
   - the time zone of the warnings `startTime`/`endTime`. They have no offset (`2026-10-17T08:33:00`). **Default: parse them as Europe/Lisbon** unless the fixtures show otherwise;
   - the fogos.pt fields for id, lat/lon, place, status, start time, resources and nature.

   Write the confirmed facts in a comment at the top of the parser.

## Architecture

```text
browser ── /api/* (Vite proxy) ──> ingest (.NET, :5080) ──> IPMA, Open-Meteo, fogos.pt
   │                                   │
   │                                   └── ingest/cache/*.json (raw upstream bodies + fetchedAt)
   └── Wind ──> sim.worker ──> engine (unchanged)
```

- The service fetches **on request**, with a time-to-live (TTL) per source, instead of on a schedule. This is simpler than Quartz and enough for one laptop. Deviation from §6 noted in `docs/decisoes.md`.
- The cache stores **raw upstream bodies**, so a parser fix needs no re-download, and the offline mode can replay a real day.
- Port 5080. The Vite proxy is set in both `server.proxy` and `preview.proxy`, so there is no CORS to configure.

### Files

```text
ingest/
  Ingest.slnx                     (`dotnet new sln` in .NET 10 creates .slnx)
  Ingest/Ingest.csproj            net10.0, Microsoft.NET.Sdk.Web, no extra packages
  Ingest/Program.cs               configuration, HttpClient, the two endpoints
                                  (delete the generated Properties/launchSettings.json: it sets a random port)
  Ingest/UpstreamCache.cs         GetAsync(key, url, ttl): cache + fetch + stale fallback
  Ingest/Weather.cs               pure parsing and selection (IPMA, Open-Meteo, RCM, warnings)
  Ingest/Incidents.cs             pure fogos.pt parsing and bbox filter
  Ingest.Tests/Ingest.Tests.csproj  xUnit
  Ingest.Tests/WeatherTests.cs
  Ingest.Tests/IncidentsTests.cs
  Ingest.Tests/UpstreamCacheTests.cs
  Ingest.Tests/fixtures/*.json
web/src/lib/weather.ts            response types, fetchWeather, fetchIncidents, toWind
web/src/components/WeatherPanel.tsx
```

Parsing and selection are static functions that take already-deserialised JSON (`JsonElement`) plus **each source's `fetchedAt`** (from its `meta.json`). They **never read the clock**. They are tested on fixtures without HTTP.

### Configuration (environment variables, read in `Program.cs`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `INGEST_CACHE_DIR` | `ingest/cache` (gitignored) | Where raw bodies are kept |
| `INGEST_OFFLINE` | unset | `1` = never call upstream; serve whatever is in the cache, marked stale |
| `FOGOS_API_KEY` | unset | Sent in the header confirmed in step 0, **never in the URL**, because `meta.json` stores the URL and the demo cache is committed. Without a key, still try once and honour 429 |
| `ASPNETCORE_URLS` | `http://localhost:5080` | Port. `Program.cs` sets 5080 itself when the variable is unset, and the npm script uses `--no-launch-profile`, so no launch profile can override it |

HttpClient: 8 s timeout and `User-Agent: LinhaZero/0.1 (rodrigorcvicente@gmail.com)`, exactly the value registered in the fogos.pt access request.

**Culture:** every number formatted into a URL or cache key, and every number parsed from JSON strings (the `latitude`/`longitude` in `distrits-islands.json` are strings), uses `CultureInfo.InvariantCulture`. On a pt-PT machine, `41.45.ToString("F2")` gives `41,45`.

## Cache and failure behaviour (`UpstreamCache`)

`GetAsync(key, url, ttl)` returns `{ body: JsonElement?, fetchedAt, stale: bool, error: string? }`.

| Situation | Result |
| --- | --- |
| Cache file younger than TTL | Cached body, `stale = false`, no network call |
| Older or missing → fetch OK (2xx, valid JSON that is not an empty `{}` or `[]`) | Write `<dir>/<key>.json` + `<key>.meta.json` (`fetchedAt`, `url`) atomically (write a temp file, then move), return fresh |
| Fetch fails (timeout, non-2xx, invalid or empty JSON), cache exists | Cached body, `stale = true`, `error` = short reason. A good cache is never overwritten by a bad body |
| Fetch fails, no cache | `body = null`, `error` |
| Any failure | No new attempt for that key for 60 s, or until `Retry-After` has passed on a 429 (whichever is longer). Kept in an in-memory map |
| `INGEST_OFFLINE=1` | Never fetch; cache → `stale = true`, `error = "offline"`; no cache → `error = "offline, sem cache"` |

One `SemaphoreSlim` per key, so two requests at the same moment cause one upstream call.

Keys and TTLs:

| Key | TTL |
| --- | --- |
| `ipma-stations`, `ipma-districts` | 7 days |
| `ipma-observations` | 10 min |
| `ipma-rcm-d0` | 1 h |
| `ipma-warnings` | 10 min |
| `open-meteo-<lat:2dp>_<lon:2dp>` | 15 min. Coordinates rounded to 0.01° (about 1 km), so ignitions in the same 0.01° bin share a cache file (a cell 100 m away can fall in the next bin). **The URL is built from the same rounded coordinates**, so the cached body always matches its key |
| `fogos-active` | 2 min |

`/api/weather` fetches its sources **in parallel** (`Task.WhenAll`), so a flaky network costs one 8 s timeout, not five.

## API contract

### `GET /api/weather?lat=41.45&lon=-8.29`

`400` if lat/lon are missing or outside 36.5–42.5 N, −10–−6 E (mainland Portugal). The order is always **lat, then lon** (query string, C# and the TS `fetchWeather(lat, lon)`), to avoid mixing them up.

`200`:

```jsonc
{
  "location": { "lat": 41.45, "lon": -8.29 },
  "use": "observed",                       // which one fills the sliders: "observed" | "model"
  "observed": {                            // IPMA station, null if none qualifies
    "directionDeg": 45,                    // null when calm
    "speedMs": 2.6,
    "humidityPct": 66,                     // null when -99
    "temperatureC": 22.1,
    "observedAt": "2026-10-17T11:00:00Z",
    "station": { "id": 1210622, "name": "Braga, Merelim", "distanceKm": 18.6 }
  },
  "model": {                               // Open-Meteo current, null if unavailable
    "directionDeg": 92, "speedMs": 4.7, "gustMs": 9.8,
    "humidityPct": 57, "temperatureC": 22.3,
    "observedAt": "2026-10-17T12:15:00Z"
  },
  "forecast": [                            // Open-Meteo hourly, the 6 h after the data was fetched; [] if unavailable
    { "time": "2026-10-17T13:00:00Z", "directionDeg": 91, "speedMs": 4.6, "humidityPct": 56 }
  ],
  "fireRisk": { "level": 2, "label": "Moderado", "municipality": "0308", "date": "2026-10-17" },  // or null
  "warnings": [                            // only yellow/orange/red, active or starting within 24 h of fetchedAt
    { "type": "Tempo Quente", "level": "yellow", "start": "...", "end": "...", "text": "..." }
  ],
  "warningArea": "BRG",
  "sources": [                             // one per upstream used, for the age/stale line
    { "name": "IPMA observações", "fetchedAt": "...", "stale": false, "error": null }
  ],
  "windSource": "IPMA observações"         // which entry of `sources` the chosen wind came from
}
```

`503` with the same `sources` list if neither `observed` nor `model` has a wind speed.

All times in the response are ISO 8601 UTC with `Z`. The browser shows them in `Europe/Lisbon`.

### Selection rules (in `Weather.cs`, pure and tested)

**Reference time.** Each source is judged against `asOf` = **that source's `fetchedAt`**, not the real clock. A cache recorded days ago then gives the same answer as it did when it was recorded, which is what keeps the offline demo working. Ages *shown* to the user are still `now − observedAt`, so old data looks old.

- **Missing values:** in `observations.json`, a whole station-hour entry can be JSON `null` (about 725 of them in today's file), and **any** field can be −99 (wind, `temperatura`, `humidade`, `pressao`, ...). Both mean "missing" and map to `null`.
- **IPMA direction:** `idDireccVento` 1–8 → (code − 1) × 45°, 9 → 0°.
- **Calm:** `speedMs < 0.25` (it rounds to 0 on the slider), whatever the code. A calm observation has `directionDeg: null`. Code 0 with speed ≥ 0.25 → invalid observation.
- **Valid observation:** a non-missing `intensidadeVento` and either calm or a direction code 1–9, in that station's newest non-null hour that is **at most 3 h before `asOf`**. (The lag is about 1.5 h, so a 1 h limit would always fail.)
- **Station:** the nearest station with a valid observation, **within 25 km** (haversine). The Guimarães fixture must pick Merelim (18.6 km), skipping Guimarães (3.3 km) and Braga (CIM) (14.7 km), which both report −99.
- **Model:** the Open-Meteo `current` block, read as UTC, valid if its time is at most 3 h before `asOf` (the same rule as observations).
- **`use`:** `"observed"` if a station qualifies and is not calm; otherwise `"model"` if the model is valid; otherwise `"observed"` (calm) if that is all there is; otherwise 503. When calm, the browser sets the speed to 0 and keeps the current direction.
- **Forecast:** request `forecast_hours=7`, because the first entry is the current hour. Keep `hourly` entries with `time > asOf`, at most 6.
- **Fire risk:** the `rcm-d0` entry whose centroid is nearest to the point. Labels: 1 Reduzido, 2 Moderado, 3 Elevado, 4 Muito elevado, 5 Máximo.
- **Warnings:** the `idAreaAviso` of the nearest listed place in `distrits-islands.json` with `idRegiao == 1` (mainland; the file lists more than district capitals). Mark it `// ponytail: nearest listed place, wrong near district borders; use district polygons if it matters`. Drop `green`. Keep those whose end is after `asOf` and whose start is within 24 h of `asOf`. Times are Europe/Lisbon unless step 0 shows otherwise.
- Constants: `MaxStationKm = 25`, `MaxDataAge = 3 h`, `ForecastHours = 6`, `CalmMs = 0.25`.

### `GET /api/incidents?bbox=minLon,minLat,maxLon,maxLat`

`400` if the bbox is malformed. `200`:

```jsonc
{
  "incidents": [
    { "id": "...", "lat": 41.4, "lon": -8.2, "place": "Guimarães, Selho S. Jorge",
      "status": "Em curso", "startedAt": "...Z", "nature": "Mato",
      "resources": { "people": 12, "vehicles": 3, "aerial": 0 } }
  ],
  "source": { "name": "fogos.pt", "fetchedAt": "...", "stale": false, "error": null }
}
```

Only rural or forest fires (filter by the nature field confirmed in step 0), inside the bbox. If fogos.pt fails and there is no cache: `200` with `incidents: []` and `error` set, so the UI can say why.

## Web changes

1. **`web/vite.config.ts`:** `server.proxy` and `preview.proxy` = `{ "/api": "http://localhost:5080" }`.
2. **`web/src/lib/weather.ts`:** TypeScript types copied by hand from the contract above (two small DTOs, no code generation), plus:
   - `fetchWeather(lat, lon)` and `fetchIncidents(bounds)`, both with `signal: AbortSignal.timeout(15000)`.
     - If `fetch` rejects (network error, timeout), or the `content-type` does not start with `application/json` (ASP.NET sends `application/json; charset=utf-8`), **whatever the status**: "Serviço de meteorologia indisponível. Está a correr? `npm run dev:ingest`. O vento manual continua a funcionar." (When the target is down, Vite 6 answers **500** with an empty text/plain body, not 502/504.)
     - A JSON error response (400, 503): throw a Portuguese message using its content.
   - `toWind(snapshot, current: Wind): Wind`. It takes `observed` or `model` according to `use`. Direction: `Math.round(d) % 360`, because the slider max is 359 and Open-Meteo can return 360. Speed: rounded to 0.5 and clamped to 0–20 (the slider range). When calm it keeps `current.directionDeg`.
3. **`web/src/components/WeatherPanel.tsx`**, placed under `<WindControl>` (`App.tsx:418`):
   - Button "Usar o tempo de agora". It is disabled while loading or while no grid is loaded.
   - The point is the centre of the ignition cell (`gridToLngLat(header, col + 0.5, row + 0.5)`), or the grid centre when there is no ignition. The card says which: "no ponto de ignição" or "no centro da zona".
   - After a successful call, a card shows:
     - `IPMA · Braga, Merelim (19 km) · 12:00 (há 1 h 25 min)`, or `Modelo Open-Meteo · 13:15`;
     - the other value for comparison, on one muted line: `Modelo: 4.7 m/s de E` (direction names from the existing `compassName` in `WindControl.tsx`);
     - `Humidade 66% (ainda não entra no modelo) · 22 °C`;
     - `Risco de incêndio: Moderado`, coloured on the IPMA 5-level scale;
     - warnings as chips (`Aviso amarelo: Tempo Quente`);
     - `Próximas horas: 14h E 4.6 · 15h E 4.0 · ...` (m/s);
     - if the source named in `windSource` is `stale`: `Vento de há 3 h (sem ligação)`, in the warning colour. The age is worked out **in the browser** as `now − observedAt` of the chosen wind value. Other sources are mentioned only if they failed with no cache (for example `Risco de incêndio indisponível`), so a refresh failure of the 7-day stations list never shows "há 7 dias".
   - If the user moves a slider after applying, the card adds "ajustado à mão" ("adjusted by hand"). This is derived by comparing `wind` with the wind that was applied; no extra state flag.
   - **State:** `App.tsx` keeps `applied: { wind: Wind; weather?: SavedScenario["weather"]; snapshot?: WeatherSnapshot } | null`. It is cleared **only in the grid `<select>` `onChange` (`App.tsx:385`) and inside `igniteAt`** (the only path where the user moves the ignition: map click or incident click). It is never cleared in an effect on `gridName`, `bundle` or `ignition`. Such an effect would wipe the value `applyScenario` has just set, because `applyScenario` calls `setGridName` and `setIgnition` (`App.tsx:284-285`). Clearing on an ignition change stops the card from saying "no ponto de ignição" for a point that has moved. `applyScenario` sets it to `{ wind: saved.wind, weather: saved.weather }` (no card, only the provenance line), so a reloaded file keeps its provenance through the same "wind still equals applied" check.
   - Footer: `Dados: IPMA · Open-Meteo · fogos.pt (VOST Portugal)`.
4. **Incidents:**
   - A checkbox "Ocorrências ativas (fogos.pt)" next to the OSM toggle (`App.tsx:393`). Turning it on fetches for the grid bounds (`gridBounds(header)`). There is a "↻" button to refresh; no polling.
   - `MapView` gets an `incidents` prop and an `onIncidentClick(lngLat)` prop, and draws HTML markers the same way as the village labels (`MapView.tsx:243`), on both maps. Tooltip (`title`): place, status, start time, resources.
     - The markers get their own CSS class with `pointer-events: auto; cursor: pointer`. The village and ignition markers use `pointer-events: none`, so copying their class would make the markers unclickable.
     - The marker element's click handler calls `e.stopPropagation()`. Otherwise the click also reaches the map's `click` handler and adds a drawing vertex or ignites a second time.
   - Clicking a marker calls `igniteAt(lngLat)`, **whatever the current tool**. `igniteAt` is the ignite branch of `onMapClick` (`App.tsx:190-205`) moved into a function, so the "outside the grid" and "does not burn" checks are reused. An incident on an unburnable cell gets the existing message.
   - Status line: `N ocorrências ativas na zona`, `Sem ocorrências ativas na zona`, or the error text (for example when 429 and no key). If `source.stale`, add its age: `(dados de há 3 dias, sem ligação)`, so recorded incidents never look current.
5. **Weather provenance in scenarios:**
   - `web/src/lib/scenario.ts`: optional `SavedScenario.weather?: { source: "ipma" | "open-meteo"; station?: string; observedAt: string; fetchedAt: string }`. `version` stays 1, because older files simply have no field. `parseSavedScenario` keeps `weather` only if `source` is one of the two values and the other fields are strings (the file comes from the user); otherwise it drops it.
   - `web/src/App.tsx`: `saveScenario` writes `applied.weather` only if the current wind still equals `applied.wind`. After `applyScenario`, the weather panel shows the provenance as a read-only line ("Vento do IPMA, Merelim, 17/10 12:00").
6. **`inputKeyOf` does not change.** The weather card is not a simulation input; only `wind` is.

## Root scripts and repo hygiene

- `package.json`:
  - `"dev:ingest": "dotnet run --no-launch-profile --project ingest/Ingest"`;
  - `"dev:ingest:demo": "dotnet run --no-launch-profile --project ingest/Ingest -- --offline --cache-dir ingest/demo-cache"`. `Program.cs` reads these two arguments as well as the environment variables, so the script works without a POSIX shell;
  - `"test:ingest": "dotnet test ingest"`.

  `npm run test` stays engine-only, so teammates without .NET are not blocked.
- `.gitignore`: `ingest/**/bin/`, `ingest/**/obj/`, `ingest/cache/`.
- `.prettierignore`: add `ingest/`, so `npm run format` does not rewrite about 1 MB of raw JSON fixtures and the demo cache. `eslint.config.js`: add `"ingest/**"` to `ignores`.

## Offline demo mode

There is no `?scenario=penha` yet (it is a separate §7.1 item). Until there is, the recording point is fixed here: **the Penha slope of the Guimarães grid, around 41.427 N, −8.270 W**. That point is cell `{row: 103, col: 92}`: burnable, but a slow fuel (spread rate 3). Prefer a faster burnable cell nearby, so the live moment shows clear spread. Write the exact `{row, col}` used in `ingest/README.md`. When the Penha scenario exists, use its ignition cell instead.

1. On a day with useful weather, start the service normally, choose the Guimarães grid, ignite at that cell, and press the button. Turn on the incidents toggle once.
2. Copy `ingest/cache/` to `ingest/demo-cache/` (committed; about 1.1 MB, mostly `observations.json`).
3. For the demo: `npm run dev:ingest:demo`.

What works offline:
- **Anywhere on the grid:** IPMA observations, fire risk and warnings, because those files cover the whole country and are judged against their own `fetchedAt`.
- **Only at the recorded cell** (and nearby cells that round to the same 0.01° bin; a cell 100 m away can miss): the Open-Meteo model value and forecast. Elsewhere `model` is `null` and the forecast is empty; the button still fills the wind from IPMA.

The card shows the real age ("Vento de há N dias (sem ligação)"), and the incidents line shows that the data is old.

Document this in `ingest/README.md` (half a page: run, test, environment variables, offline mode).

## Tests

xUnit, no HTTP. Fixtures come from step 0; the tests pass each fixture's recorded `fetchedAt`. The selection code never reads the clock.

`WeatherTests`:
1. Direction codes: 1 → 0°, 2 → 45°, 8 → 315°, 9 → 0°. Speed < 0.25 → calm whatever the code (including code 2 with 0.0 m/s). Code 0 with speed ≥ 0.25 → invalid.
2. −99 and `null` entries are skipped. The Guimarães point picks "Braga, Merelim" (id 1210622), not 1210625 or 6212124. −99 humidity or temperature becomes `null` without rejecting the wind.
3. No valid station within 25 km, or the newest observation is older than 3 h before `asOf` → `use = "model"`.
3b. **Stale cache (the offline demo case):** the selection result depends only on the fixtures and their recorded `fetchedAt`. Run it with the clock faked 5 days later (or check that no clock is injected at all) and get the same `observed`, `forecast` and `warnings`.
4. No station and no model → reports "no wind" (the endpoint maps this to 503).
5. RCM: the Guimarães point → municipality `0308`.
6. Warnings: the point → area `BRG`; green dropped; an expired warning dropped.
7. Forecast: only `time > asOf`, at most 6 (the 7-hour fixture gives exactly 6).
8. Culture: one test sets `CultureInfo.CurrentCulture = pt-PT` and checks that the Open-Meteo URL and cache key contain `41.45`, not `41,45`.

`UpstreamCacheTests` (temporary directory, fake fetch delegate that counts calls):
1. A fresh cache entry does not call fetch.
2. Expired entry + failing fetch → cached body with `stale = true`.
3. No cache + failing fetch → `error`, `body = null`.
4. 429 with `Retry-After` → no second fetch within that time. Any other failure → no second fetch within 60 s.
5. An empty `{}` body does not overwrite a good cache.
6. Offline mode never calls fetch.
7. Two concurrent calls for the same key → one fetch.

`IncidentsTests`: the fogos fixture is normalised; out-of-bbox incidents and non-fire natures are dropped.

Web: no new test framework. The logic in `toWind` is a few lines. If it grows, it moves to the engine package and is tested with Vitest.

## Docs

- `docs/decisoes.md`, new entries (decided / why / set aside):
  - **Ingestão a pedido com cache em ficheiro** (on-request ingestion with a file cache). Set aside: a scheduler (Quartz) and a database.
  - **Estação IPMA antes do modelo, até 25 km e 3 h** (IPMA station before the model, within 25 km and 3 h). Set aside: always the model, or a weighted mix.
  - **Cache em bruto e modo offline** (raw cache and offline mode). Set aside: storing normalised snapshots, and the versioned snapshots of proposta-tecnica §5.1 (only the last good copy is kept).
  - **Vento único no motor; previsão só informativa** (one wind in the engine; the forecast is information only). Set aside: hourly wind in the engine (later).
- `README.md`: the .NET requirement, `npm run dev:ingest` in a second terminal (or `npm run dev:ingest:demo` offline), the new button, and that everything except this button works without the service.

## Order of work

1. Step 0: SDK, API-key request, fixtures, confirmed facts. (0.5 h; the key arrives whenever it arrives)
2. `UpstreamCache` and its tests. (1.5 h)
3. `Weather.cs` parsers and selection, tests, `/api/weather`. (2.5 h)
4. Vite proxy, `weather.ts`, `WeatherPanel`, App wiring. (2 h)
5. `Incidents.cs`, `/api/incidents`, toggle, markers, `igniteAt`. (1.5 h; can wait for the API key)
6. Scenario provenance, offline demo cache, docs. (1 h)

Total about 1 day, as in the proposal. If time runs short, cut in this order: incidents (step 5), then warnings together with the districts source, which §7.1 does not promise (it names observations and RCM).

## Done when

- `npm run test:ingest` passes; `npm run test`, `npm run typecheck`, `npm run lint` still pass.
- With the service running, `curl 'localhost:5080/api/weather?lat=41.45&lon=-8.29'` returns `200` with `observed` or `model` filled in and all `sources` fresh.
- In the browser: set an ignition on the Guimarães grid → "Usar o tempo de agora" → the sliders move, the card shows source, age, humidity, risk and forecast → Simular works.
- With the network off and the cache warm: the button still works and shows "sem ligação" and the data's age.
- With the service stopped: the button shows the "indisponível" message (not a blank 500), and `?scenario=demo` runs exactly as before.
- `npm run dev:ingest` listens on 5080 (check the startup log).
- With `npm run dev:ingest:demo` and Wi-Fi off, days after the recording: at the recorded Penha cell the card shows IPMA wind, model, forecast, risk and age; at another cell it still fills the wind from IPMA. The end-to-end flow works three times in a row.
- Clicking an incident marker sets the ignition and adds no drawing vertex, even with a drawing tool active.

## Risks and open questions

| Item | Default if nobody decides |
| --- | --- |
| No fogos.pt key in time (429 without it) | Ship weather first. Incidents show the error text; the pitch still sets the ignition by hand |
| October weather will not match the "15h de agosto, SO 25 km/h" pitch | The pitch uses the saved Penha scenario. "Usar o tempo de agora" is shown as a separate live moment ("e se fosse agora?" — "and what if it were now?") |
| No active incident near Guimarães during the demo | Show the toggle with "Sem ocorrências ativas na zona". **No made-up incidents** shown as if they were real |
| Open-Meteo terms are non-commercial | Fine for the hackathon; noted in `decisoes.md` for a pilot (ECMWF open data or an IPMA agreement) |
| IPMA direction has only 8 sectors (45°) | Shown as is; the ensemble already varies the direction by ±20° |
