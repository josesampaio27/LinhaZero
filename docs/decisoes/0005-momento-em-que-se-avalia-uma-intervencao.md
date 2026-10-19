# ADR 0005: Momento em que se avalia uma intervenção

- Estado: aceite
- Data: 2026-10-16

## Decisão

O abrandamento conta se estiver ativo no minuto de partida `t`; a contenção conta se estiver ativa no minuto de chegada `t + custo`.

## Porquê

É o que o enunciado pede e evita resolver uma equação por passo.

## Alternativas consideradas

Integrar a velocidade ao longo do passo quando a intervenção começa a meio.
