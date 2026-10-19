# ADR 0042: Poucos serviços: API e ingestão em .NET, workers do motor, PostgreSQL e NATS

- Estado: aceite
- Data: 2026-10-17
- Substitui: [ADR 0022](0022-arquitetura-de-quatro-pecas.md) e [ADR 0023](0023-api-em-typescript.md)

## Decisão

Além da interface com o motor no browser, o sistema tem um punhado de serviços, separados pelo perfil de execução e não por funcionalidade:

- **API** (.NET 10, sem estado, REST e SSE em `/api/v1`): meteorologia e ocorrências a partir dos snapshots, pedidos de corrida, progresso, resultados e rasters;
- **ingestão** (.NET 10): a única peça que chama as fontes externas (IPMA, Open-Meteo, fogos.pt), em ciclos fixos, com um só líder ([ADR 0038](0038-ingestao-singleton-com-advisory-lock-numa-ligacao-dedicada.md));
- **workers do motor** (Node 24 com o mesmo motor TypeScript, [ADR 0031](0031-workers-do-motor-em-node-nao-em-rust.md)): tiram os jobs de uma fila, um de cada vez, e escalam pelo número de contentores;
- **PostgreSQL**: snapshots das fontes, estado, resultado e rasters das corridas;
- **NATS** (JetStream): a fila de jobs e os eventos de progresso.

A preparação de dados (`data-prep/`) continua a ser um script em lote, agora também em contentor. Tudo vive no mesmo monorepo e corre com `docker compose` ([`infra/README.md`](../../infra/README.md)). O browser continua a simular sozinho: sem os serviços, a demonstração funciona como antes.

## Porquê

- Cada peça tem uma razão para existir à parte: a ingestão é periódica e singleton, a API responde a pedidos e escala sem estado, os workers gastam CPU e escalam com a procura (`--scale engine-worker=4`). Assim, muitos incidentes ao mesmo tempo não pesam na API, e uma falha do IPMA não afeta as simulações.
- Os ensembles grandes (200 corridas) e o registo de cada corrida (`runs`: pedido, hash da grelha, worker, resultado) passam a existir no servidor, o que é a base da auditoria.
- São poucos serviços, não dezenas de microsserviços: ficaram de fora o Redis, o armazenamento de objetos, o Kubernetes e o servidor de identidade ([o que fica de fora](../arquitetura/04-estrategia.md#o-que-fica-de-fora-e-quando-volta)).
- A API em .NET foi escolha da equipa. O custo previsto na ADR 0023 (manter os tipos em duas linguagens) resolve-se com os contratos por exemplos partilhados ([ADR 0036](0036-contratos-por-exemplos-partilhados.md)), testados dos dois lados.

## Alternativas consideradas

- Quatro peças com uma só API em TypeScript e o motor só no browser ([ADR 0022](0022-arquitetura-de-quatro-pecas.md), [ADR 0023](0023-api-em-typescript.md)): menos serviços, mas sem ensembles no servidor e com a recolha das fontes dentro da API.
- Os "microsserviços pragmáticos" da primeira proposta técnica, com Redis, armazenamento de objetos, workers em Rust e Kubernetes: mais peças do que a necessidade medida.
