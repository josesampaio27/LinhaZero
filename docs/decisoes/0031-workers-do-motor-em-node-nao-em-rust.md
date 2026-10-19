# ADR 0031: Workers do motor em Node, não em Rust

- Estado: aceite
- Data: 2026-10-17

## Decisão

Os workers correm o motor TypeScript existente (`@linha-zero/engine`) em Node 24, a partir da fila JetStream `runs.jobs`.

## Porquê

O motor não se reescreve sem uma medição que o justifique ([ADR 0024](0024-motor-continua-em-typescript.md)); o contrato do job e do resultado (`contracts/`) é neutro quanto à linguagem, por isso um worker Rust substitui este sem tocar na API nem na interface.

## Alternativas consideradas

Reescrever em Rust agora.
