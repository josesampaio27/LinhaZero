# ADR 0047: Clientes HTTP tipados, modelos JSON e Dapper

- Estado: aceite
- Data: 2026-10-18

## Decisão

Os serviços .NET passam a usar as peças normais do ASP.NET Core, em vez de código feito à mão:

- **Clientes HTTP tipados** (`IHttpClientFactory`): `IpmaClient`, `OpenMeteoClient` e `FogosClient`, em `services/Ingest/Clients/`. Cada um tem o endereço base, um método por pedido, 8 s de timeout e o User-Agent. A chave do fogos.pt vai só no cabeçalho `X-API-Key`.
- **Sem repetições automáticas** (nem Polly nem `AddStandardResilienceHandler`):
  - o ciclo de cada fonte já tenta de novo na volta seguinte;
  - uma falha espera pelo `Retry-After` guardado em `source_status`;
  - o fogos.pt só pode receber um pedido por intervalo.
- **Ligações:** os clientes vivem tanto como o worker, por isso usam ligações com tempo de vida (`PooledConnectionLifetime`), a recomendação da Microsoft para clientes tipados em singletons.
- **Modelos JSON:** cada ficheiro das fontes é uma classe C# (`Core/Weather/Ipma/`, `Core/Weather/OpenMeteo/`, `Core/Incidents/Fogos/`), lida com System.Text.Json. Os nomes portugueses passam a nomes ingleses com `[JsonPropertyName]`. Conversores pequenos tratam as particularidades das fontes: o -99 do IPMA quer dizer "sem valor", e o fogos.pt envia números em texto.
- **Uma só leitura por fonte:** cada classe implementa `IUpstreamFile<T>` (`Parse` e `IsUsable`). A ingestão só guarda um corpo que se lê como a classe da fonte; a API lê o corpo guardado com o mesmo `Parse` e guarda o objeto em cache enquanto a linha mais recente não muda.
- **Dapper** para o SQL de `snapshots`, `source_status`, `runs` e `run_rasters`. O SQL continua escrito à mão; os parâmetros e a leitura das colunas passam a uma linha. O `LeaderLock` continua em Npgsql direto, porque precisa de uma ligação dedicada, fora do pool.
- **Opções:** as variáveis de ambiente lêem-se num só sítio por programa e entram como `IOptions<T>` (`GridOptions`, `SourceOptions`, `NatsOptions`, `IngestOptions`). Os nomes das variáveis não mudam.
- **Estilo:** `services/.editorconfig` com as convenções de C# da Microsoft, verificado na compilação e por `dotnet format --verify-no-changes` na CI. As regras de escrita estão em `services/README.md`.

O comportamento fica igual:

- as rotas, os corpos JSON e os erros `{ "error": "..." }`;
- os intervalos e o limite do fogos.pt;
- os URLs guardados com cada snapshot (os testes comparam-nos com os gravados nas fixtures).

## Porquê

O código funcionava, mas lia-se mal:

- os ficheiros das fontes eram percorridos com cadeias de `JsonElement.GetProperty(...)`;
- a ingestão usava um `HttpClient` próprio, passado como delegate, e os URLs estavam espalhados;
- o acesso à base de dados repetia o mesmo código de parâmetros e leitores em cada consulta;
- as variáveis de ambiente eram lidas em vários sítios.

Com as peças normais, quem conhece ASP.NET Core encontra cada coisa onde a espera. As regras das fontes ficam escritas como tipos (que campos existem, que podem faltar), e não espalhadas pelo código que as lê.

## Alternativas consideradas

- **Entity Framework:** pesado para quatro tabelas com SQL simples, e traz migrações, quando o esquema está em `infra/db/001_init.sql`.
- **A API chamar as fontes a cada pedido:** perde os snapshots da demo sem rede e arrisca o limite do fogos.pt ([ADR 0030](0030-ingestao-agendada-com-snapshots-em-postgres.md)).
- **ProblemDetails (RFC 9457) para os erros:** é o formato normal do ASP.NET Core, mas a interface lê `{ "error" }`. Fica para a alteração que adapta a interface, para que a API e a interface mudem juntas.
