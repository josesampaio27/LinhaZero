# ADR 0040: Grelha lida por job, hash do cabeçalho e das camadas

- Estado: substituída em parte pela ADR 0043 (a definição do hash)
- Data: 2026-10-17

## Decisão

O worker lê a grelha do disco em cada job (cerca de 7 ms) e `runs.grid_hash` é o sha256 de `header.json` mais todas as camadas; não há cache de grelhas no worker.

## Porquê

O plano previa uma cache por nome + hash do cabeçalho, mas uma grelha refeita pelo pipeline geoespacial sobre a mesma bbox mantém o cabeçalho e muda as camadas: a cache serviria o combustível antigo e a hash mentiria na auditoria.

## Alternativas consideradas

A cache de 4 grelhas do plano (a leitura é mais barata do que uma única corrida).
