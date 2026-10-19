# ADR 0006: Precisão dos tempos

- Estado: aceite
- Data: 2026-10-16

## Decisão

O Dijkstra trabalha em Float64 e só converte para Float32 no resultado.

## Porquê

Comparar chaves Float64 da fila com tempos arredondados a Float32 fazia o algoritmo voltar a meter células na fila sem fim.

## Alternativas consideradas

Guardar tudo em Float32.
