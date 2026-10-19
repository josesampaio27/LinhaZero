# ADR 0026: Ingestão a pedido com cache em ficheiro

- Estado: substituída pela ADR 0030
- Data: 2026-10-17

## Decisão

O serviço `ingest/` (.NET) vai buscar cada fonte quando um pedido chega e a cópia em cache já passou do seu tempo de vida; guarda os corpos em bruto em `ingest/cache/` e serve a última cópia boa, marcada como antiga, quando a fonte falha.

## Porquê

É o suficiente para um portátil e uma demo; uma falha a montante nunca impede uma simulação, e um erro de parsing corrige-se sem voltar a descarregar.

## Alternativas consideradas

Um agendador (Quartz.NET) e uma base de dados ([tecnologia](../arquitetura/04-estrategia.md#tecnologia)).
