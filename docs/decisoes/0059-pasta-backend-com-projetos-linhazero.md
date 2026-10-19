# ADR 0059: Pasta `backend/` com projetos `LinhaZero.*`

- Estado: aceite
- Data: 2026-10-19
- Muda a localização dos projetos da [ADR 0046](0046-api-com-controladores-e-openapi.md); as pastas internas de cada projeto ficam iguais

## Contexto

Os projetos .NET viviam em `services/Api`, `services/Core`, `services/Ingest` e `services/Tests`. O nome `services/` não dizia nada: o `engine-worker` também é um serviço, e a interface também corre em contentor. Os projetos tinham nomes genéricos (`Api.dll`, `Ingest.dll`) enquanto os namespaces já eram `LinhaZero.Api`, `LinhaZero.Ingest`, ...

## Decisão

```
backend/
  LinhaZero.slnx, Directory.Build.props, .editorconfig
  src/LinhaZero.Api/      src/LinhaZero.Core/      src/LinhaZero.Ingest/
  tests/LinhaZero.Tests/
```

- **`backend/`** diz o papel: a API e a ingestão que servem a interface.
- **`src/` e `tests/`** separam o código que vai para produção dos testes, como é habitual em .NET.
- **A pasta, o projeto, o assembly e o namespace raiz têm o mesmo nome** (`LinhaZero.Api`). Os contentores correm `LinhaZero.Api.dll` e `LinhaZero.Ingest.dll`.
- O contexto de build do Docker passa a ser `backend/`; os comandos passam a `dotnet test backend` e `npm run test:backend`.

## Alternativas

- **`dotnet/`:** honesto sobre o conteúdo, mas nomeia pela tecnologia e não pelo papel.
- **Projetos na raiz (`api/`, `ingest/`, `core/`):** cada peça ao nível do `engine-worker/`, mas a solução, o `Directory.Build.props` e o `.editorconfig` iam para a raiz, ao lado da configuração do npm.
- **`apps/` e `packages/`:** agrupa por papel em todas as linguagens, mas mistura a configuração do npm e do .NET nas mesmas pastas e muda todos os caminhos do repositório.

## Consequências

- O `engine-worker/` continua fora de `backend/`: é um workspace npm que depende do `engine/` e partilha o `package-lock.json` da raiz.
- As ADR e os planos anteriores falam de `services/`; ficam como estavam, porque descrevem o que existia na altura.
