# ADR 0065: Mudanças ao esquema aplicadas pela API ao arrancar

- Estado: aceite
- Data: 2026-10-21

## Contexto

Os scripts de `infra/db/` só correm quando o volume do Postgres está vazio (é o que faz a imagem `postgres`). Numa base que já tem dados, uma tabela nova tinha de ser criada à mão, localmente e no cluster. O deploy (`infra/k8s/deploy.sh`) só faz `kubectl apply`, e de propósito o runner não pode entrar nos pods (`infra/runner/rbac.yaml`), por isso também não pode correr SQL.

## Decisão

- **A base atual:** `infra/db/000` a `003` continuam a correr só num volume vazio. Todas as bases que existem já os têm.
- **O que muda depois:** cada mudança é um script `NNN_nome.sql` em `backend/src/LinhaZero.Core/Database/Migrations/`, embutido no assembly, a começar em `004_feedback.sql`. A imagem da API leva-os consigo.
- **Ao arrancar**, antes de servir pedidos, a API (`Services/MigrateOnStart.cs`, com `Database/Migrator.cs`) faz numa só transação:
  1. pede o lock `pg_advisory_xact_lock`;
  2. cria `schema_migrations` se ainda não existir;
  3. corre, por ordem do nome, os scripts que ainda não estão em `schema_migrations`, e regista cada um.
- Se o Postgres ainda não responde, a API espera até 2 minutos. Se um script falha, a transação desfaz tudo e a API não arranca.
- Os scripts continuam a usar `if not exists`, para se poderem correr à mão sem estragar nada.

## Porquê

- Juntar uma mudança ao esquema passa a ser só fazer merge: o deploy põe a API nova, e a API traz a base para o estado de que precisa.
- Duas réplicas que arrancam ao mesmo tempo esperam pelo mesmo lock: cada script corre uma vez.
- Uma falha não deixa a base a meio. O pod novo não fica pronto, o rolling update mantém os antigos a servir, e o deploy fica vermelho no GitHub.
- O lock é da transação, não da sessão, por isso funciona com ligações do pool (ao contrário do `LeaderLock`).

## Alternativas consideradas

- **Correr o script à mão depois de cada merge** (`kubectl exec … psql`): não muda nada, mas é fácil esquecer, e uma API nova que precise da tabela falha até alguém o fazer.
- **Um Job do Kubernetes no deploy:** o runner teria de poder criar Jobs, e o Job precisaria da senha da base.
- **Uma ferramenta de migrações (EF Core Migrations, DbUp, Flyway):** é mais uma dependência para fazer o que cabem em 60 linhas. Se um dia forem precisas reversões ou migrações em C#, trocamos.

## Consequências

- Os scripts correm dentro de uma transação: `create index concurrently` e outros comandos que não podem correr numa transação não cabem aqui.
- Uma base criada do zero recebe `000`–`003` da imagem `postgres` e o resto da API, no primeiro arranque.
- A ingestão e os workers do motor não aplicam mudanças: se um dia precisarem de uma tabela nova, só a encontram depois de a API arrancar.
- Os testes HTTP em memória não têm Postgres e retiram este serviço (`ApiFactory`). `Integration/MigratorTests.cs` testa-o com `TEST_PG`.
