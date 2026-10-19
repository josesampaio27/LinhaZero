# Serviços .NET (`backend/`)

A API e a ingestão, em .NET 10. Como correm e onde encaixam: [`README.md`](../README.md) e [arquitetura, blocos](../docs/arquitetura/05-blocos.md#serviços-net-backend).

```
LinhaZero.slnx              a solução; Directory.Build.props e .editorconfig valem para todos os projetos
src/LinhaZero.Core/         biblioteca partilhada: base de dados (Dapper), fontes, meteorologia, ocorrências, grelhas, geografia
src/LinhaZero.Api/          Controllers/ → Services/ → Repositories/ (SQL) e Messaging/ (NATS); Models/ são os corpos JSON
src/LinhaZero.Ingest/       Workers/ (os ciclos) → Services/Puller (uma recolha) → Clients/ (HTTP para IPMA, Open-Meteo, fogos.pt)
tests/LinhaZero.Tests/      xUnit, com as mesmas pastas; Integration/ precisa do compose (TEST_PG=1)
```

Cada pasta tem o nome do projeto, do assembly e do namespace raiz ([ADR 0059](../docs/decisoes/0059-pasta-backend-com-projetos-linhazero.md)).

```bash
dotnet build backend
dotnet test backend                                  # TEST_PG=1 também corre os testes de PostgreSQL e NATS contra o compose
dotnet format backend                                # aplica as regras de .editorconfig (a CI corre --verify-no-changes)
dotnet run --project backend/src/LinhaZero.Api      # http://localhost:8080/api/docs, contra o PostgreSQL e o NATS do compose
```

## Como se escreve aqui

As [convenções de C# da Microsoft](https://learn.microsoft.com/dotnet/csharp/fundamentals/coding-style/coding-conventions), com o que o `.editorconfig` verifica (namespaces de ficheiro, chavetas em blocos de várias linhas, `_camelCase` nos campos privados, sufixo `Async`), e mais isto:

- **Peças normais do ASP.NET Core:**
  - controladores para os endpoints;
  - `IHttpClientFactory` com clientes tipados para HTTP;
  - `IOptions<T>` para as configurações;
  - Dapper com SQL escrito à mão para a base de dados;
  - System.Text.Json com classes para o JSON das fontes (nada de `JsonElement.GetProperty(...)` em cadeia).
- **Sem interfaces para cada serviço:** classes concretas, registadas como singletons. Só há interface quando há mais de uma implementação (`IUpstreamFile<T>`).
- **Nomes que dizem o que são:** nada de letras soltas, exceto `i`/`j` em ciclos, `e` num `catch` e lambdas de uma linha.
- **Uma instrução por linha,** e linhas até cerca de 120 colunas. Uma expressão comprida divide-se em variáveis com nome.
- **Records em vez de tuplos** nos métodos públicos; retornos cedo em vez de `if` aninhados; métodos que cabem num ecrã.
- **Os comentários dizem porquê, não o quê:** o que se confirmou nas fontes, o que se decidiu e as limitações conhecidas ("Limitation: ...").
- **Mensagens para o utilizador em português,** código e comentários em inglês.
