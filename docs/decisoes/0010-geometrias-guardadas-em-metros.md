# ADR 0010: Geometrias guardadas em metros

- Estado: aceite
- Data: 2026-10-16

## Decisão

As intervenções e a ignição guardam-se como coordenadas EPSG:3763 e só se convertem em células na hora de simular. Na versão 1 do ficheiro de cenário a ignição era uma célula; esses ficheiros continuam a abrir, com a ignição no centro dessa célula.

## Porquê

Os cenários continuam válidos se a resolução da grelha mudar, e a ignição fica no mesmo sítio quando se troca de grelha (se cair fora, a interface diz).

## Alternativas consideradas

Guardar listas de células no ficheiro de cenário.
