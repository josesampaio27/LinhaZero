# ADR 0032: Sem armazenamento de objetos

- Estado: aceite
- Data: 2026-10-17

## Decisão

As grelhas são um bind mount só de leitura de `web/public/grids` em todos os serviços; os rasters de resultado são `bytea` em Postgres (cerca de 95 KB × 4 por corrida).

## Porquê

As imagens `minio/minio` e `minio/mc` deixaram de poder ser descarregadas (verificado em 2026-10-17); uma só cópia da grelha garante que o browser e o servidor simulam o mesmo; o Postgres aguenta estes tamanhos e funciona entre máquinas.

## Alternativas consideradas

S3/MinIO com COG e Zarr. Volta quando houver Kubernetes ou grelhas nacionais.
