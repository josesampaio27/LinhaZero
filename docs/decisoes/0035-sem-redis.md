# ADR 0035: Sem Redis

- Estado: aceite
- Data: 2026-10-17

## Decisão

O estado dos jobs vive em Postgres (`runs`); o progresso vai por NATS core; a API só memoriza snapshots já analisados, por `id` de linha (imutáveis).

## Porquê

Menos um serviço para operar; nada mediu ainda uma necessidade de cache.

## Alternativas consideradas

Redis. Acrescenta-se quando houver uma necessidade de cache medida.
