# Contratos

Os ficheiros em `examples/` são a fonte de verdade dos tipos partilhados entre a interface (TypeScript, `engine/src/contracts.ts`), o worker do motor (Node) e a API (.NET: `backend/src/LinhaZero.Api/Models` e os `*Models.cs` de `backend/src/LinhaZero.Core`). Os testes de ambos os lados desserializam cada exemplo e falham se faltar um campo obrigatório; não há gerador. O documento OpenAPI da API (`/api/openapi/v1.json`, Swagger UI em `/api/docs`) é gerado a partir desses tipos C#; os exemplos continuam a ser a referência. Cada `dotnet build` da API (ou `npm run api:client`) grava esse documento em `contracts/openapi.json` e o NSwag gera a partir dele o cliente TypeScript `web/src/api/client.ts` (definições em `backend/src/LinhaZero.Api/nswag.json`). Os dois ficheiros vão no git; não se editam à mão. Todas as horas são ISO 8601 UTC com `Z`; os nomes são camelCase.

## `assistant-status.json` — `GET /api/v1/assistant/status`

`enabled` (o servidor tem a chave da Anthropic), `model`, e o que quem tem sessão gastou hoje (`usedTodayUsd`, dia de Lisboa) contra o seu limite (`dailyBudgetUsd`), em dólares ([ADR 0074](../docs/decisoes/0074-assistente-com-claude-haiku.md)). A conversa em si (`POST /api/v1/assistant/v1/messages`) usa o formato da Messages API da Anthropic, não um contrato próprio.

## `run-request.json` — `POST /api/v1/runs`

| Campo | Significado |
| --- | --- |
| `grid` | Nome da grelha em `web/public/grids/<grid>/` (a mesma pasta que a API e os workers montam em `/grids`) |
| `ignition` | Célula `{ row, col }`, dentro da grelha |
| `wind` | `directionDeg` 0–359 (de onde sopra), `speedMs` 0–20 |
| `durationMin` | 60–1440 |
| `ensemble` | `runs` 1–500, `windDirJitterDeg`, `windSpeedJitterPct`, `seed`. A e B correm com as mesmas opções e a mesma semente (ensemble emparelhado) |
| `decisions` | `A` e `B`: listas de `Intervention` do motor, já rasterizadas em células pelo browser (`toEngineIntervention`). No máximo 50 intervenções por decisão e `rows × cols` células por intervenção |
| `weather` | Opcional, proveniência do vento (`source`, `station`, `observedAt`, `fetchedAt`), guardada tal como vem |
| `ignitions` | Opcional, células `{ cell: { row, col }, t0Min }` que ardem desde o seu minuto (a área já ardida, já rasterizada pelo browser). Substitui `ignition` na propagação; o worker valida-as contra a grelha |
| `weatherSteps` | Opcional, o tempo hora a hora como no [ficheiro de cenário](../docs/referencia/formato-cenario.md); o worker valida-o (minutos crescentes, vento e humidade válidos) |
| `scenario` | Opcional, a simulação como foi desenhada: o [ficheiro de cenário](../docs/referencia/formato-cenario.md) que "Guardar ficheiro" escreveria, mas com `variants` a `{ "A": null, "B": null }` (as variantes já vão no `variants` do pedido, que tem no máximo 1 MB). A API guarda-o e o worker ignora-o; `GET /api/v1/runs/{id}/scenario` devolve-o com as variantes repostas, para o histórico ([ADR 0073](../docs/decisoes/0073-historico-de-simulacoes.md)) |
| `spreadModel`, `moisture` | Opcionais, como no [ficheiro de cenário](../docs/referencia/formato-cenario.md): o modelo de propagação e a humidade do combustível. A API passa-os sem os ler; o worker valida-os e recusa o pedido sem repetir se forem inválidos ou se a grelha não tiver parâmetros de Rothermel |

`runId` não vem do cliente: a API gera-o, grava-o na linha `runs` e põe-no na mensagem `runs.jobs` (`{ runId, ...pedido }`). Resposta: `202 { runId }` + `Location`; `400` com mensagem em português se a validação falhar; `503` se a fila estiver indisponível.

## `run-result.json` — `runs.result` e `GET /api/v1/runs/{id}`

| Campo | Significado |
| --- | --- |
| `durationMin` | O da corrida |
| `rows`, `cols` | Da grelha usada, para o browser verificar o tamanho dos rasters |
| `A`, `B` | `metrics` (o `Metrics` do motor: `burnedHaByHour`, `buildingsReached`, `villages`) e `runs` (`RunMetrics[]`, uma entrada por corrida perturbada) |
| `elapsedMs` | Tempo das duas decisões no worker |

`paired` e `likelyHa` **não** vêm no resultado: o browser calcula-os pelo mesmo caminho das corridas locais. Os rasters (`arrival` e `probability` por decisão, Float32 little-endian, `rows × cols × 4` bytes) vêm de `GET /api/v1/runs/{id}/rasters/{A|B}/{arrival|probability}`.

## `run-event-*.json` — `GET /api/v1/runs/{id}/events` (SSE) e `runs.<id>.events` (NATS core)

- `{ "type": "progress", "status": "queued" | "running", "done": 0..2, "total": 2 }`
- `{ "type": "done" }`
- `{ "type": "failed", "error": "..." }`

No SSE, `event:` é o `type` e `data:` é o JSON. Um `event: ping` sem dados a cada 15 s é um batimento que o cliente ignora.

## `weather.json` — `GET /api/v1/weather?lat&lon`

Igual ao contrato de `plan-weather.md`: `use` diz qual dos dois (`observed` ou `model`) preenche o vento; `sources` tem uma entrada por fonte com `fetchedAt`, `stale` e `error`; `windSource` é o nome da fonte de onde veio o vento. `observed` é a estação mais próxima (até 25 km) com vento válido nas últimas 2 h, da hora mais recente que o tem; `air` traz a humidade e a temperatura da estação mais próxima que mediu alguma delas nas últimas 2 h (muitas estações não têm anemómetro, por isso pode ser outra). `503` com `sources` se nenhuma fonte tiver vento.

## `incidents.json` — `GET /api/v1/incidents/active?bbox=minLon,minLat,maxLon,maxLat`

Fogos rurais ativos dentro da bbox, do instantâneo mais recente do fogos.pt, com a fonte (idade, `stale`, `error`).
