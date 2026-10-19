# ADR 0038: Ingestão singleton com advisory lock numa ligação dedicada

- Estado: aceite
- Data: 2026-10-17

## Decisão

Só um processo de ingestão recolhe. Cada réplica tenta `pg_try_advisory_lock(hashtext('linha-zero-ingest'))` numa ligação própria, sem pool e com keepalive; o líder faz `select 1` nessa ligação a cada 30 s e, se falhar, pára os ciclos e volta a concorrer. As réplicas de reserva tentam a cada 30 s.

## Porquê

Não há vantagem em pedir o IPMA duas vezes, e um lock no Postgres não acrescenta nenhum serviço. A ligação tem de ser dedicada porque o Npgsql faz `DISCARD ALL` ao devolver uma ligação ao pool, o que liberta advisory locks.

## Alternativas consideradas

Eleição de líder no NATS ou um só contentor sem failover.
