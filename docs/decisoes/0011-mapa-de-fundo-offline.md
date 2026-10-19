# ADR 0011: Mapa de fundo offline

- Estado: aceite
- Data: 2026-10-16

## Decisão

O fundo por omissão é desenhado a partir da própria grelha (cor do combustível × sombreado, barreiras, edifícios); o OSM é opcional. Os nomes das aldeias são marcadores HTML.

## Porquê

A demo tem de funcionar sem internet, e as etiquetas de texto do MapLibre precisam de um servidor de fontes.

## Alternativas consideradas

Descarregar mosaicos OSM para cache local.
