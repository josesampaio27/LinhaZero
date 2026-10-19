# API

Os endpoints da API do LinhaZero (`backend/src/LinhaZero.Api`, .NET 10). A API serve a meteorologia e as ocorrências a partir dos snapshots que a ingestão guarda, e põe na fila as corridas que os workers do motor simulam; ela própria não simula nem contacta fontes externas ([Blocos](../arquitetura/05-blocos.md#serviços-net-backend)).

**Documentação interativa:** com o compose a correr, o Swagger UI está em http://localhost:3000/api/docs (ou http://localhost:8080/api/docs, direto na API) e o documento OpenAPI em `/api/openapi/v1.json`. Ambos são gerados a partir do código (controladores, modelos e comentários `///`), por isso estão sempre de acordo com a API. Os formatos de referência continuam a ser os exemplos em [`contracts/`](../../contracts/README.md).

## Endpoints (feito)

| Método e caminho | Faz | Respostas |
| --- | --- | --- |
| `GET /api/v1/weather?lat=&lon=` | Vento, humidade, risco de incêndio e avisos para um ponto de Portugal continental: o vento da estação IPMA mais próxima com vento nas últimas 2 h (até 25 km), senão o modelo Open-Meteo; a humidade e a temperatura da estação mais próxima que as mede (`air`); com a idade de cada fonte | `200` `weather.json`; `400` fora de 36.5–42.5 N, -10–-6 E; `503` nenhuma fonte tem vento |
| `GET /api/v1/incidents/active?bbox=minLon,minLat,maxLon,maxLat` | Fogos rurais ativos do fogos.pt dentro da caixa | `200` `incidents.json`; `400` sem `bbox` válida |
| `POST /api/v1/runs` | Valida o pedido e põe a corrida de A e B na fila `runs.jobs` | `202 { runId }` com `Location`; `400` pedido inválido; `503` fila indisponível (a interface corre no browser) |
| `GET /api/v1/runs/{id}` | Estado da corrida (`queued`, `running`, `done`, `failed`), progresso e resultado | `200`; `404` corrida desconhecida |
| `GET /api/v1/runs/{id}/events` | Progresso por Server-Sent Events: `progress`, `done`, `failed`, e um `ping` a cada 15 s | `200 text/event-stream` |
| `GET /api/v1/runs/{id}/rasters/{A\|B}/{arrival\|probability}` | Um raster do resultado: Float32 little-endian, `rows × cols × 4` bytes, guardado em cache um ano | `200 application/octet-stream`; `400`; `404` |
| `GET /api/v1/health` | PostgreSQL e NATS respondem? Quantos workers estão livres? | `200`; `503` se o PostgreSQL ou o NATS falharem |

Todos os erros têm o corpo `{ "error": "..." }`, com a mensagem em português que a interface mostra.

## Regras (feito)

- **Ids e limites:** os ids são UUID gerados pela API; o corpo de um pedido tem no máximo 1 MB; um ensemble tem no máximo 500 corridas, e cada decisão no máximo 50 intervenções.
- **Pedido de corrida estrito:** `POST /runs` lê o corpo à mão, recusa chaves repetidas e campos obrigatórios em falta, e passa ao worker, sem os alterar, os campos que não lê (`variants`, `weather`, `spreadModel`, `moisture`, `weatherSteps`, `ignitions`).
- **Dados externos:** a API nunca sai da rede; só a ingestão contacta o IPMA, o Open-Meteo e o fogos.pt ([Intranet](../arquitetura/07-implantacao.md#intranet)).

## Planeado

```http
GET  /api/v1/grids/manifest            → grelhas publicadas, versões e hashes (manifesto assinado)
GET  /api/v1/incidents/{id}/scenarios  → cenários partilhados nesse incidente
POST /api/v1/scenarios                 { SavedScenario, visibility, incidentId?, parentId? } → { id }  (cria sempre uma versão nova)
GET  /api/v1/scenarios/{id}            → SavedScenario
POST /api/v1/grid-variants             { GridVariant, visibility, parentId? } → { id, hash }  (cria sempre uma versão nova)
GET  /api/v1/grid-variants?grid=       → variantes visíveis para essa grelha de base
GET  /api/v1/grid-variants/{id}        → GridVariant
GET  /api/v1/runs?scenarioId=          → registo das simulações de um cenário
```

- **Erros em ProblemDetails** (RFC 9457, o formato normal do ASP.NET Core): fica para a mesma alteração que adapta a interface, que hoje lê `{ "error" }` ([ADR 0047](../decisoes/0047-clientes-http-tipados-modelos-json-e-dapper.md)).
- **Autenticação:** todos os pedidos, exceto `/health`, levam um token OpenID Connect (bearer) emitido pelo fornecedor de identidade ([Identidade](../arquitetura/08-conceitos.md#identidade-e-separação-entre-entidades)).
- **Autorização:** cada endpoint passa por uma única função de autorização (entidade, papel, visibilidade, incidente), com testes próprios.
- **Contratos partilhados:** os tipos (`SavedScenario`, `GridVariant`, métricas) vêm diretamente do pacote do motor, e a API valida cenários e variantes com as mesmas funções que a interface (`parseSavedScenario`, `parseGridVariant`). Ver [Formato do ficheiro de cenário](formato-cenario.md) e [Formato da variante](formato-variante.md).
