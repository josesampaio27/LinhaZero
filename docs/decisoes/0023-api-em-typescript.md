# ADR 0023: API em TypeScript

- Estado: substituída pela ADR 0042
- Data: 2026-10-17

## Decisão

A API é Node.js + TypeScript, como mais um workspace (`api/`).

## Porquê

Importa diretamente os tipos e a validação de cenários do motor, e pode correr o próprio motor no servidor se um dia for preciso.

## Alternativas consideradas

.NET (obrigava a manter os tipos também em C# e não corre o motor).
