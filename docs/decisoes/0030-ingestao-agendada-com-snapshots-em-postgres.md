# ADR 0030: Ingestão agendada com snapshots em Postgres

- Estado: aceite
- Data: 2026-10-17

## Decisão

A ingestão corre em ciclos fixos por fonte (`PeriodicTimer`: observações e avisos 10 min, risco 1 h, estações e distritos 24 h, Open-Meteo 15 min, fogos.pt 2 min) e insere cada corpo em bruto numa linha de `snapshots`, que nunca se atualiza; a API lê a linha mais recente e a tabela é o histórico de versões ([Grelhas e versões](../arquitetura/08-conceitos.md#grelhas-e-versões)) (3 dias num portátil; 30 num servidor). O backoff de um 429 fica em `source_status.retry_after`.

## Porquê

Separa quem chama as fontes de quem responde ao browser ([ideias centrais](../arquitetura/04-estrategia.md#ideias-centrais)), e várias réplicas da API veem os mesmos dados.

## Alternativas consideradas

Quartz.NET e Polly (seis intervalos fixos não precisam de agendador), EF Core e migrações (quatro tabelas em `infra/db/001_init.sql`; mudar o esquema implica `npm run down -- -v` até existir uma ferramenta de migração).
