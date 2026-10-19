# ADR 0027: Estação IPMA antes do modelo, até 25 km e 3 h

- Estado: aceite
- Data: 2026-10-17

## Decisão

O vento vem da estação IPMA mais próxima com observação válida (vento não omisso, direção 1–9 ou calmo), até 25 km e no máximo 3 h antes do `fetchedAt`; senão vem do Open-Meteo. A estação de Guimarães reporta vento −99, por isso no centro da grelha ganha Braga, Merelim (18,6 km).

## Porquê

Uma medição real vale mais do que um modelo quando está perto e é recente; o atraso típico do IPMA é de 1,5 h, por isso 1 h falharia sempre.

## Alternativas consideradas

Usar sempre o modelo, ou uma mistura ponderada.
