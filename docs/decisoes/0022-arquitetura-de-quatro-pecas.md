# ADR 0022: Arquitetura de quatro peças

- Estado: substituída pela ADR 0042
- Data: 2026-10-17

## Decisão

Interface com o motor no browser, uma única API (dados externos e registo), PostgreSQL e os scripts de `data-prep/`, tudo neste monorepo. O motor é uma biblioteca, não um serviço (ver [arquitetura](../arquitetura/README.md)).

## Porquê

O motor corre no browser em milissegundos (40 000 células em cerca de 12 ms, um ensemble de 31 corridas em cerca de 0,33 s), por isso não precisa de servidor, filas nem workers; uma equipa pequena opera um serviço, não dez. Monorepo e microsserviços não são opostos: o primeiro é onde vive o código, o segundo é quantos serviços correm.

## Alternativas consideradas

Os "microsserviços pragmáticos" da primeira versão da proposta técnica (ingestão .NET separada, workers do motor em Rust, fila de jobs, Redis, Kubernetes). [A estratégia de solução](../arquitetura/04-estrategia.md#o-que-fica-de-fora-e-quando-volta) diz quando cada peça voltaria.
