# ADR 0002: Formato dos binários

- Estado: aceite
- Data: 2026-10-16

## Decisão

Camadas em little-endian, extensões `.u8`, `.u16`, `.f32`, e `grids/index.json` com a lista de grelhas.

## Porquê

É a ordem nativa dos typed arrays em todos os portáteis atuais e a extensão diz o tipo.

## Alternativas consideradas

GeoTIFF no browser (exigia uma biblioteca e mais tempo de carregamento).
