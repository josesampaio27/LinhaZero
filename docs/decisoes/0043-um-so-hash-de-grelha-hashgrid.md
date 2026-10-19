# ADR 0043: Um só hash de grelha: `hashGrid`

- Estado: aceite
- Data: 2026-10-17
- Substitui em parte: [ADR 0040](0040-grelha-lida-por-job-hash-do-cabecalho-e-das-camadas.md) (só a definição do hash)

## Decisão

O hash de uma grelha é sempre `hashGrid` (`engine/src/hash.ts`): o sha256 do `header.json` em JSON canónico (chaves ordenadas) seguido dos bytes de todas as camadas. O browser calcula-o ao carregar a grelha, as variantes de grelha guardam-no em `base.sha256`, e o worker do motor grava-o em `runs.grid_hash`. A ADR 0040 continua válida no resto: a grelha lê-se do disco em cada job, sem cache.

## Porquê

Havia duas definições: o worker fazia o sha256 dos bytes do `header.json` mais as camadas, e o browser o do cabeçalho em JSON canónico mais as camadas. Com duas, uma variante feita no browser não se podia verificar no servidor, e a auditoria teria dois "hashes da grelha". O JSON canónico não depende de espaços nem da ordem das chaves no ficheiro, e o browser só tem o cabeçalho já lido, não os bytes originais.

## Alternativas consideradas

Usar a definição do worker também no browser (obrigava a guardar os bytes originais do `header.json` e mudava com uma simples reformatação do ficheiro), ou manter as duas com nomes diferentes.
