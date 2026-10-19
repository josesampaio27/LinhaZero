# ADR 0046: API com controladores, pastas por responsabilidade e OpenAPI

- Estado: aceite
- Data: 2026-10-18

## Decisão

Os serviços .NET passam a ter uma pasta por responsabilidade, e a pasta é o namespace:

- **`Core`** (antes `Data`): a biblioteca partilhada, com `Database/`, `Sources/`, `Weather/`, `Incidents/` e `Grids/`. Os parsers continuam estáticos e puros.
- **`Api`**: `Controllers/` (MVC, um por área: `Weather`, `Incidents`, `Runs`, `Health`), `Models/` (corpos dos pedidos e respostas), `Services/` (a lógica), `Repositories/` (o SQL), `Messaging/` (a fila NATS), `Validation/` (o pedido de corrida) e `OpenApi/`. O `Program.cs` só liga as peças (injeção de dependências).
- **`Ingest`**: `Workers/`, `Services/` e `Validation/`.
- **`Tests`**: `Core/`, `Api/`, `Ingest/` e `Integration/`.

A API publica um documento OpenAPI gerado do código (`Microsoft.AspNetCore.OpenApi`, em `/api/openapi/v1.json`) e o Swagger UI em `/api/docs`. Os comentários `///` dos controladores e dos modelos são as descrições.

Rotas, corpos JSON, códigos de estado e mensagens ficam iguais. Para isso:

- Os erros continuam a ser `{ "error": "..." }`: a validação automática do `[ApiController]` está desligada.
- `POST /runs` continua a ler o corpo à mão: o parser estrito recusa chaves repetidas e deixa passar os campos que a API não lê. Um transformador acrescenta o esquema do corpo ao documento.

Única mudança de comportamento: a API já não espera pelo NATS para arrancar. O stream é criado em segundo plano; até lá, `/health` e `POST /runs` respondem 503, e a interface corre no browser.

## Porquê

`Program.cs` juntava o arranque, os sete endpoints e uma cache; `Runs.cs` juntava tipos, validação, SQL, NATS e SSE numa só classe; e `Data` era mais do que acesso a dados. Com uma pasta por responsabilidade, quem chega encontra cada coisa onde a procura num projeto ASP.NET Core. O OpenAPI dá a quem integra uma página para ver e experimentar a API, sempre de acordo com o código.

Ficam de fora, por serem peso sem retorno num projeto deste tamanho ([ADR 0042](0042-poucos-servicos-api-e-ingestao-em-net-workers-do-motor-postgresql-e-nats.md)): interfaces para cada serviço, ORM, camadas de mapeamento e projetos separados por camada. As classes concretas são registadas como singletons. Os testes HTTP arrancam a API real em memória com o PostgreSQL e o NATS apontados para uma porta fechada.

## Alternativas consideradas

- Minimal API com um ficheiro de endpoints por área: mais leve, mas a equipa pediu controladores, o padrão que a maioria dos programadores .NET conhece.
- Scalar em vez do Swagger UI: mais moderno, mas é uma dependência a mais; o Swagger UI é o que toda a gente reconhece.
- Gerar os tipos a partir do OpenAPI: os exemplos em `contracts/` continuam a ser a referência partilhada com o TypeScript ([ADR 0036](0036-contratos-por-exemplos-partilhados.md)).
