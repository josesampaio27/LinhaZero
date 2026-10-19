# 4. Estratégia de solução

As ideias centrais da solução, a tecnologia escolhida, e o que deixámos de fora de propósito.

## Ideias centrais

1. **Comparar decisões, não só prever o fogo.** As decisões A e B correm com as mesmas perturbações do vento, e a comparação faz-se cenário a cenário: *"B é melhor em 27 de 30 cenários"*. Ver [Incerteza](../modelo/incerteza.md).
2. **O motor é uma função pura, o mesmo no browser e no servidor.** `simulate(grid, scenario) → result` não chama APIs, não lê ficheiros por conta própria e não sabe nada de mapas. O browser corre-o num Web Worker; os workers do motor correm exatamente o mesmo código em Node, a partir de uma fila.
3. **O browser chega sozinho; os serviços acrescentam.** Sem rede e sem Docker, a interface simula, compara e guarda cenários em ficheiro. Com os serviços a correr, ganha o tempo real ("Usar o tempo de agora"), as ocorrências ativas e os ensembles de 200 corridas no servidor. Se o servidor falhar a meio, a interface volta ao browser sozinha.
4. **Poucos serviços, separados pelo perfil de execução.** Uma API sem estado, uma ingestão singleton, workers do motor que escalam, PostgreSQL e NATS ([ADR 0042](../decisoes/0042-poucos-servicos-api-e-ingestao-em-net-workers-do-motor-postgresql-e-nats.md)). Ver [Vista de blocos](05-blocos.md).
5. **Só a ingestão fala com o exterior.** A ingestão recolhe as fontes (IPMA, Open-Meteo, fogos.pt) em ciclos fixos e guarda cada resposta como um *snapshot* datado e imutável; a API só lê snapshots. Uma falha de uma fonte não faz falhar nada: serve-se o último snapshot válido e a interface mostra a idade dos dados ([ADR 0030](../decisoes/0030-ingestao-agendada-com-snapshots-em-postgres.md)).
6. **Contratos por exemplos partilhados.** O TypeScript (interface, motor, workers) e o C# (API) não partilham código; partilham `contracts/examples/*.json`, que os testes dos dois lados leem ([ADR 0036](../decisoes/0036-contratos-por-exemplos-partilhados.md), [contratos](../../contracts/README.md)).
7. **As grelhas oficiais não se alteram; as experiências são variantes.** O Editor de grelha guarda a grelha de base mais a lista de alterações, com um hash próprio, e a simulação, no browser ou no servidor, pode comparar a grelha de base com a variante ([ADR 0025](../decisoes/0025-variantes-de-grelha.md), [ADR 0044](../decisoes/0044-variantes-de-grelha-tambem-no-servidor.md)).

### Monorepo, não microsserviços

São coisas diferentes. O monorepo é a forma de guardar o código: um repositório com `engine/`, `web/`, `engine-worker/`, `services/`, `contracts/`, `infra/` e `data-prep/`. Microsserviços seria dezenas de serviços, um por funcionalidade. Temos poucos serviços, cada um com uma razão para correr à parte (ver a tabela de [blocos](05-blocos.md#contentores-c4-nível-2)), e um repositório onde uma mudança de contrato se faz numa só alteração, com os testes dos dois lados.

### Porque o motor continua em TypeScript, e quando mudar

- **Chega para o problema real.** Uma simulação nunca cobre o país inteiro: cobre uma janela à volta da ignição. Os números medidos estão em [Requisitos de qualidade](10-qualidade.md#desempenho).
- **Um só motor.** O browser e os workers correm o mesmo pacote (`@linha-zero/engine`), por isso o servidor dá exatamente o mesmo resultado que o browser.
- **Escala sem reescrita.** No servidor, mais procura resolve-se com mais workers (`--scale engine-worker=N`); no browser, cada utilizador faz as suas contas.

**Quando mudar:** o primeiro passo é repartir o trabalho por vários Web Workers no browser, ou o ensemble por vários workers no servidor (por índice de corrida, com a mesma semente). Se, com o modelo físico completo e as grelhas pretendidas, uma comparação com incerteza no portátil de referência continuar acima de 10 s, reescreve-se o núcleo do motor em **Rust compilado para WebAssembly** (estimamos 2 a 3 vezes mais rápido); um worker em Rust substitui o de Node sem tocar na API, porque o contrato do job é neutro ([ADR 0024](../decisoes/0024-motor-continua-em-typescript.md), [ADR 0031](../decisoes/0031-workers-do-motor-em-node-nao-em-rust.md)).

## Tecnologia

| Camada | Escolha | Estado | Alternativa |
| --- | --- | --- | --- |
| Interface | React + TypeScript, MapLibre GL; duas páginas (Simulação e Editor de grelha) | Feito | — |
| Funcionamento sem rede | Hoje: o browser simula sozinho; depois, PWA (Workbox) | Feito / planeado | — |
| Mapa de fundo | Desenhado a partir da grelha (feito); fundo cartográfico opcional em PMTiles interno ou da DGT (planeado) | Feito / planeado | — |
| Motor | TypeScript, num Web Worker no browser e nos workers do motor (Node 24) | Feito | Rust → WebAssembly, se for preciso |
| API | .NET 10, ASP.NET Core minimal API, REST + Server-Sent Events, sem estado | Feito | TypeScript ([ADR 0023](../decisoes/0023-api-em-typescript.md), substituída) |
| Ingestão | .NET 10, `BackgroundService` + `PeriodicTimer`, um líder por advisory lock | Feito | Quartz.NET e Polly (desnecessários para seis intervalos fixos) |
| Fila e eventos | NATS JetStream (fila `runs.jobs`), NATS core (eventos `runs.<id>.events`); cliente `NATS.Net` na API | Feito | RabbitMQ |
| Base de dados | PostgreSQL 16, SQL simples com Npgsql e `pg` | Feito | PostGIS, quando houver pesquisas espaciais |
| Contratos | Exemplos JSON partilhados, testados em xUnit e Vitest | Feito | JSON Schema ou Protobuf com geração de código |
| Identidade | OpenID Connect: o fornecedor da entidade; Keycloak como intermediário com várias entidades, mais o Autenticação.gov | Planeado | — |
| Preparação de dados | Python 3.11+, rasterio, geopandas, GDAL; também como imagem `geo-pipeline` | Feito | — |
| Implantação | Docker Compose (`docker compose up -d --build` arranca tudo, interface incluída), imagens multi-arquitetura, utilizadores não root, portas só no loopback | Feito | Kubernetes + KEDA, à escala nacional |
| CI | GitHub Actions: tipos, lint, testes e build (feito); testes do worker e dos serviços, benchmarks, SBOM (planeado) | Feito / planeado | — |

## O que fica de fora, e quando volta

A primeira proposta técnica previa também Redis, armazenamento de objetos, workers em Rust e Kubernetes. Cada peça que ficou de fora tem um gatilho que a faria voltar:

| Componente | Porque não agora | Quando volta |
| --- | --- | --- |
| Redis | O estado dos jobs vive em `runs` (PostgreSQL) e o progresso vai por NATS ([ADR 0035](../decisoes/0035-sem-redis.md)) | Quando houver uma necessidade de cache medida |
| Armazenamento de objetos (S3, MinIO) | As grelhas são um bind mount só de leitura em todos os serviços; os rasters de resultado são `bytea` no PostgreSQL ([ADR 0032](../decisoes/0032-sem-armazenamento-de-objetos.md)) | Com Kubernetes ou grelhas nacionais |
| PostGIS | Ainda não há consultas espaciais ([ADR 0033](../decisoes/0033-postgres-sem-postgis.md)) | No dia em que aparecer uma coluna de geometria |
| SignalR | O progresso só flui do servidor para o browser: chega o SSE ([ADR 0034](../decisoes/0034-server-sent-events-em-vez-de-signalr.md)) | Quando houver anotações partilhadas entre entidades, nos dois sentidos |
| Reescrita do motor em Rust | O TypeScript chega para as grelhas atuais | Ver "Quando mudar", acima |
| Repartir um ensemble por vários workers; progresso por corrida | Um worker corre as duas decisões de um job; 200 corridas demoram segundos ([ADR 0039](../decisoes/0039-um-job-de-cada-vez-por-worker.md)) | Ensembles muito maiores, ou grelhas a 30 m |
| Motor de rotas (OSRM) | Uma estimativa pela rede viária do OSM chega para o primeiro modelo de meios | Se a estimativa se mostrar grosseira |
| Keycloak como intermediário de identidade | Ainda não há login | Mais de um fornecedor de identidade, utilizadores sem nenhum (algumas associações de bombeiros) ou um fornecedor que a intranet não alcança |
| Cenários, variantes e incidentes no PostgreSQL | Os cenários e as variantes vivem em ficheiros e no browser | Com o login e a partilha entre entidades ([Base de dados](../referencia/base-de-dados.md)) |
| Ferramenta de migrações do esquema | Quatro tabelas, aplicadas na criação do volume; mudar o esquema implica `npm run down -- -v` | Com as tabelas de cenários e incidentes |
| OpenTelemetry, Prometheus, Grafana | Registos JSON e endpoints de saúde chegam num portátil | Com operação real |
| Kubernetes, KEDA, Terraform | Um `docker compose` chega para o piloto | À escala nacional; os serviços do compose passam um a um a Deployments, e o KEDA escala os workers pela fila |
