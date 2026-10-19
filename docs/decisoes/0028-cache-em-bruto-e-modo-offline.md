# ADR 0028: Cache em bruto e modo offline

- Estado: aceite
- Data: 2026-10-17

## Decisão

A cache guarda as respostas tal como vieram, com `fetchedAt`; a seleção é julgada contra esse `fetchedAt`, nunca contra o relógio. Sem rede, a API serve o seed gravado em `infra/demo/snapshots.csv` (antes: `ingest/demo-cache/`), e a interface mostra a idade real dos dados ("Vento de há 3 dias (sem ligação)").

## Porquê

A demo tem de funcionar sem internet e dar o mesmo resultado dias depois da gravação, sem fingir que os dados são de agora.

## Alternativas consideradas

Guardar instantâneos normalizados, e as versões sucessivas de cada snapshot ([ideias centrais](../arquitetura/04-estrategia.md#ideias-centrais)) (só fica a última cópia boa).
