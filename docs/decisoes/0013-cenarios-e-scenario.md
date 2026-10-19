# ADR 0013: Cenários e `?scenario=`

- Estado: aceite
- Data: 2026-10-16

## Decisão

Um cenário é um JSON (`version`, `grid`, ignição, vento, duração, incerteza e as intervenções de A e B); `?scenario=<nome>` lê `web/public/scenarios/<nome>.json`, simula e mostra logo o estado final.

## Porquê

Abrir o URL mostra a comparação pronta, sem animação a meio da apresentação; o "▶" continua disponível.

## Alternativas consideradas

Pôr o cenário inteiro codificado no URL.
