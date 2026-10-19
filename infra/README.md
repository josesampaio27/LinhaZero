# Infraestrutura local (`infra/`)

A arquitetura do projeto a correr num portátil com `docker compose`: a interface, uma API, um worker de ingestão, workers do motor que escalam, Postgres e NATS. O browser mantém o seu próprio motor para corridas únicas e para a demo sem rede. As decisões estão em [`docs/decisoes/`](../docs/decisoes/README.md), em particular as ADR [0042](../docs/decisoes/0042-poucos-servicos-api-e-ingestao-em-net-workers-do-motor-postgresql-e-nats.md) e [0045](../docs/decisoes/0045-um-comando-arranca-tudo-interface-em-contentor.md).

Os serviços estão definidos em `infra/docker-compose.yml`, que o `compose.yaml` da raiz inclui. Todos os comandos correm na raiz do repositório:

```bash
cp infra/.env.example infra/.env   # opcional; os valores por omissão chegam para correr
docker compose up -d --build       # build + arranque de tudo (precisa de rede na primeira vez); o mesmo que `npm run up`
                                   # interface em http://localhost:3000, /api encaminhado para a API
docker compose logs -f             # logs JSON de todos os serviços (`npm run logs`)
docker compose down                # pára e mantém os volumes; `-v` apaga-os (obrigatório depois de mudar infra/db/*.sql)
infra/smoke.sh --fresh             # teste ponta a ponta, incluindo escalar e matar um worker
TEST_PG=1 npm run test:backend    # os testes de Postgres e NATS correm contra este compose (sem TEST_PG são saltados)
```

Requisitos: Docker com Docker Compose 2.20 ou mais recente (por causa do `include`). Para desenvolver fora dos contentores: .NET 10 SDK e Node 24; `npm run dev` corre a interface com recarregamento automático em http://localhost:5173, ao lado dos serviços.

O nome do projeto é `linha-zero`, por isso os volumes chamam-se `linha-zero_pgdata` e `linha-zero_natsdata`. Quem já tinha corrido com `-f infra/docker-compose.yml` tem os dados antigos em `infra_pgdata`; a base nova começa vazia (`docker volume rm infra_pgdata infra_natsdata` apaga os antigos).

## Serviços e portas

| Serviço | Imagem | Porta no host | Função |
| --- | --- | --- | --- |
| `web` | `web/` (build Node 24, servida por `nginx-unprivileged:1.28.0-alpine`) | 3000 | A interface compilada; encaminha `/api` para a API (SSE sem buffering) e serve as grelhas de `web/public/grids` |
| `postgres` | `postgres:16.12-alpine` | 5432 | `snapshots`, `source_status`, `runs`, `run_rasters` (`infra/db/001_init.sql`, aplicado quando o volume `pgdata` está vazio) |
| `nats` | `nats:2.10.29-alpine` (JetStream) | 4222, 8222 (monitor) | Stream `RUNS` = `runs.jobs` (fila de trabalho); eventos `runs.<id>.events` em NATS core |
| `ingest` | `backend/src/LinhaZero.Ingest` (.NET 10) | 127.0.0.1:8081 | Recolhe IPMA, Open-Meteo e fogos.pt em intervalos fixos; um líder por advisory lock; `GET /health/ready` |
| `api` | `backend/src/LinhaZero.Api` (.NET 10) | 8080 | REST + SSE em `/api/v1`: `weather`, `incidents/active`, `runs`, `runs/{id}`, `runs/{id}/events`, `runs/{id}/rasters/{A\|B}/{arrival\|probability}`, `health`; OpenAPI em `/api/openapi/v1.json` e Swagger UI em `/api/docs` |
| `engine-worker` | `engine-worker/` (Node 24 + `@linha-zero/engine`) | — | Tira um job de cada vez da fila, corre A e B, grava resultado e rasters; `/healthz` em 9090 |
| `geo-pipeline` | `data-prep/` (Python 3.12), perfil `batch` | — | `build_grid.py` em lote; escreve em `web/public/grids/<nome>/` |
| `demo-seed` | `postgres:16.12-alpine`, perfil `demo` | — | Carrega `infra/demo/snapshots.csv` |

`web/public/grids/` é montado só de leitura em `/grids` na API, nos workers e na ingestão, e em `/grids/` na interface: o browser e o servidor simulam exatamente a mesma grelha.

A ingestão faz **um** pedido ao fogos.pt a cada 2 minutos e respeita o `Retry-After` de um 429 (guardado em `source_status.retry_after`, por isso um reinício não insiste). Sem `FOGOS_API_KEY` a API do fogos.pt pode responder 429; a interface mostra o erro e a ignição marca-se à mão.

## Variáveis de ambiente (`infra/.env`)

| Variável | Omissão | Significado |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `dois` | Senha do utilizador `dois` (base `dois`) |
| `FOGOS_API_KEY` | vazio | Chave do fogos.pt, enviada no header `X-API-Key`, nunca no URL |
| `INGEST_OFFLINE` | vazio | `1` = a ingestão nunca contacta as fontes; a API serve os snapshots mais recentes marcados como antigos |
| `INGEST_INTERVAL_<FONTE>` | 10, 10, 60, 1440, 1440, 15, 2 | Minutos entre recolhas: `IPMA_OBSERVATIONS`, `IPMA_WARNINGS`, `IPMA_RCM_D0`, `IPMA_STATIONS`, `IPMA_DISTRICTS`, `OPEN_METEO`, `FOGOS_ACTIVE` |

Todos os serviços leem a ligação ao Postgres das variáveis libpq (`PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`), definidas no compose; o worker lê `NATS_URL` e `GRIDS_DIR`.

## Escalar

```bash
docker compose up -d --scale engine-worker=4   # 4× o débito, sem alterar código
docker compose up -d --scale api=2             # a API não tem estado (o progresso chega por NATS)
```

A ingestão também pode escalar (as réplicas extra ficam à espera do advisory lock e assumem se o líder cair), mas o mapeamento `127.0.0.1:8081:8081` só serve uma réplica: para `--scale ingest=2`, remove essa linha de `ports` no compose (o `smoke.sh` deixa de conseguir ler `/health/ready`).

`GET /api/v1/health` devolve `idleWorkers` = pedidos de pull à espera no consumer `engine`. Um worker a meio de um `simulate` não conta, por isso a interface considera o servidor disponível enquanto viu um worker livre nos últimos 60 s.

## Demo sem rede

Duas camadas, para que a falha de uma nunca pare a demo:

1. **Sem Docker:** `npm install && npm run dev` e tudo corre no browser (corridas únicas e o ensemble de 30 corridas). O botão "Usar o tempo de agora" diz "indisponível" e a opção "no servidor" não aparece ativa.
2. **Docker sem internet:** a API serve os snapshots gravados em `infra/demo/snapshots.csv`, com a idade real ("Vento de há N dias (sem ligação)"), e os ensembles no servidor continuam a funcionar porque as grelhas são locais.

**Gravar** (com rede, de preferência num dia com vento, depois de a ingestão ter completado um ciclo — ver os logs ou `curl localhost:8080/api/v1/weather?lat=41.45&lon=-8.29`):

```bash
docker compose exec -T postgres psql -U dois -c "\copy (select source, key, fetched_at, body, url from (select distinct on (source, key) * from snapshots where source not like 'test-%' and key not like 'test-%' order by source, key, fetched_at desc) s) to stdout csv header" > infra/demo/snapshots.csv
```

Só a linha mais recente por (fonte, chave), sem `id`, cerca de 1 MB. O `-T` desliga o pseudo-terminal, que acrescentaria `\r` e estragaria o CSV. A gravação atual é de **2026-10-17 ~15:15 UTC (vento fraco, 3,5 m/s de NE em Merelim)**, um ciclo completo da ingestão em Docker, fogos.pt incluído: convém gravar de novo num dia com mais vento antes da demo.

**Carregar** (depois de `docker compose up -d --build`, numa base vazia ou não; linhas repetidas são inofensivas):

```bash
docker compose --profile demo run --rm demo-seed
```

**Correr sem rede:** põe `INGEST_OFFLINE=1` em `infra/.env` (funciona em qualquer shell, Windows incluído) e `npm run up:offline`, que nunca faz build nem pull.

**Lista antes da demo:** com rede, `docker compose up -d --build` uma vez, para que as imagens fiquem descarregadas e construídas; gravar ou atualizar o seed; sem rede, usar só `up:offline`. Testar três vezes seguidas: botão do tempo, ocorrências, "no servidor (200)".

## Nota para o pitch

200 corridas no servidor demoram alguns segundos, o que um portátil também faria no browser. O caminho do servidor não é "mais rápido para um utilizador": é a arquitetura — muitos incidentes ao mesmo tempo, escalar acrescentando workers, e um rasto auditável (`runs` guarda o pedido, a hash da grelha, o worker e o resultado de cada simulação).
