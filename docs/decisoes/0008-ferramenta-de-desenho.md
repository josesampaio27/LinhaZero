# ADR 0008: Ferramenta de desenho

- Estado: aceite
- Data: 2026-10-16

## Decisão

Desenho próprio e mínimo (clique para vértices, duplo clique ou Enter para terminar, Esc para cancelar) com fontes GeoJSON do MapLibre.

## Porquê

Só precisamos de linhas e polígonos simples em dois mapas; evita integrar e sincronizar o terra-draw em duas instâncias.

## Alternativas consideradas

Terra-draw (fica como opção se for preciso editar vértices).
