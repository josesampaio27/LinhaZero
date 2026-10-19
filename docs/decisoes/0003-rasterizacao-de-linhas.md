# ADR 0003: Rasterização de linhas

- Estado: aceite; atualizada pela [ADR 0051](0051-dezasseis-vizinhos-no-modelo-de-rothermel.md) (16 vizinhos no Rothermel)
- Data: 2026-10-16

## Decisão

Linhas rasterizadas em "supercover" 4-conexo (travessia Amanatides-Woo).

## Porquê

O fogo propaga-se a 8 vizinhos; uma linha 8-conexa (Bresenham) deixaria o fogo passar na diagonal.

## Alternativas consideradas

Bresenham, e linhas com dois pixels de largura.
