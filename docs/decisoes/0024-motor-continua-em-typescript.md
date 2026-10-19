# ADR 0024: Motor continua em TypeScript

- Estado: aceite
- Data: 2026-10-17

## Decisão

O modelo físico (Rothermel, elipse, vento no relevo) evolui no motor TypeScript atual; só se reescreve em Rust/WebAssembly se uma medição mostrar que o browser é lento demais para a grelha pretendida.

## Porquê

As medições atuais chegam com folga para uma janela de 30 × 30 km a 100 m; uma reescrita agora custava meses sem ganho visível.

## Alternativas consideradas

Reescrever já em Rust com alvos WebAssembly, nativo e Python.
