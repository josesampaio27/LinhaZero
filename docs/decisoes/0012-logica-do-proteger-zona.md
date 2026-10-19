# ADR 0012: Lógica do "Proteger zona"

- Estado: aceite
- Data: 2026-10-16

## Decisão

"Ataque" usa `rateFactor` 0,2 e "Proteger zona" usa 0,1 (`engine/src/params.ts`).

## Porquê

O enunciado não dá o fator de proteção; proteger uma zona (meios parados junto às casas) deve ser mais forte do que um ataque.

## Alternativas consideradas

Deixar o utilizador escolher o fator (fica para depois).
