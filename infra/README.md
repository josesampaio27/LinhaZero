# Infraestrutura local (`infra/`)

A arquitetura do projeto a correr num portátil com `docker compose`: a landing, a interface, o login (Keycloak), uma API, um worker de ingestão, workers do motor que escalam, Postgres e NATS. O browser mantém o seu próprio motor para corridas únicas e para a demo sem rede. As decisões estão em [`docs/decisoes/`](../docs/decisoes/README.md), em particular as ADR [0042](../docs/decisoes/0042-poucos-servicos-api-e-ingestao-em-net-workers-do-motor-postgresql-e-nats.md) e [0045](../docs/decisoes/0045-um-comando-arranca-tudo-interface-em-contentor.md).

Para o cluster (Kubernetes atrás de um Cloudflare Tunnel), ver [`k8s/README.md`](k8s/README.md).

Os serviços estão definidos em `infra/docker-compose.yml`, que o `compose.yaml` da raiz inclui. Todos os comandos correm na raiz do repositório:

```bash
cp infra/.env.example infra/.env   # opcional; os valores por omissão chegam para correr
docker compose up -d --build       # build + arranque de tudo (precisa de rede na primeira vez); o mesmo que `npm run up`
                                   # https://linhazero.localhost (landing), https://app.… (interface), https://account.… (login)
docker compose logs -f             # logs JSON de todos os serviços (`npm run logs`)
docker compose down                # pára e mantém os volumes; `-v` apaga-os (as mudanças ao esquema não precisam: a API aplica-as ao arrancar, ADR 0065)
infra/smoke.sh --fresh             # teste ponta a ponta, incluindo escalar e matar um worker
TEST_PG=1 npm run test:backend    # os testes de Postgres e NATS correm contra este compose (sem TEST_PG são saltados)
```

Requisitos: Docker com Docker Compose 2.20 ou mais recente (por causa do `include`), e as portas 80 e 443 livres. Para desenvolver fora dos contentores: .NET 10 SDK e Node 24; `npm run dev` corre a interface com recarregamento automático em http://localhost:5173, ao lado dos serviços (o login também funciona aí). Na primeira vez, confiar no certificado local: ver [Login](#login-keycloak).

O nome do projeto é `linha-zero`, por isso os volumes chamam-se `linha-zero_pgdata` e `linha-zero_natsdata`. Quem já tinha corrido com `-f infra/docker-compose.yml` tem os dados antigos em `infra_pgdata`; a base nova começa vazia (`docker volume rm infra_pgdata infra_natsdata` apaga os antigos).

## Serviços e portas

| Serviço | Imagem | Porta no host | Função |
| --- | --- | --- | --- |
| `proxy` | `caddy:2.11.7-alpine` | 80, 443 | A única entrada do browser, como o túnel no cluster (`infra/Caddyfile`): `linhazero.localhost` e `landing.` → `landing`; `app.` → `web`, e `/api/*` → `api` (SSE sem buffering); `account.` → `keycloak`. HTTPS com a autoridade local do Caddy |
| `web` | `web/` (build Node 24, servida por `nginx-unprivileged:1.28.0-alpine`) | — | A interface compilada, em https://app.linhazero.localhost; serve as grelhas de `web/public/grids` |
| `landing` | `landing/` (build Node 24, servida por `nginx-unprivileged:1.28.0-alpine`) | — | A página de apresentação compilada, em https://linhazero.localhost; serve a grelha do relevo de `web/public/grids` |
| `keycloak` | `infra/keycloak/` (Keycloak 26.8.1, tema e realm `linhazero`) | — | O login, em https://account.linhazero.localhost; base própria `keycloak` no mesmo Postgres; envia os emails (convites, recuperação de palavra-passe) |
| `mailpit` | `axllent/mailpit:v1.31.3` | 127.0.0.1:8025 | Caixa de correio falsa: recebe todos os emails do Keycloak e da API, para os ver em http://localhost:8025. No cluster usa-se um serviço de email a sério |
| `postgres` | `postgres:16.12-alpine` | 5432 | `snapshots`, `source_status`, `runs`, `run_rasters`, `users`, `data_protection_keys`, `access_requests`, `feedback`, `schema_migrations`, e a base `keycloak` (`infra/db/*` quando o volume `pgdata` está vazio; as mudanças depois disso, `backend/src/LinhaZero.Core/Database/Migrations/`, aplica-as a API ao arrancar) |
| `nats` | `nats:2.10.29-alpine` (JetStream) | 4222, 8222 (monitor) | Stream `RUNS` = `runs.jobs` (fila de trabalho); eventos `runs.<id>.events` em NATS core |
| `ingest` | `backend/src/LinhaZero.Ingest` (.NET 10) | 127.0.0.1:8081 | Recolhe IPMA, Open-Meteo e fogos.pt em intervalos fixos; um líder por advisory lock; `GET /health/ready` |
| `api` | `backend/src/LinhaZero.Api` (.NET 10) | 127.0.0.1:8080 | REST + SSE em `/api/v1`: `weather`, `incidents/active`, `runs`, `runs/{id}`, `runs/{id}/events`, `runs/{id}/rasters/{A\|B}/{arrival\|probability}`, `me`, `health`; login em `/api/auth/{login,callback,logout}`; OpenAPI em `/api/openapi/v1.json` e Swagger UI em `/api/docs`. Tudo pede sessão, exceto `health` e `auth` |
| `engine-worker` | `engine-worker/` (Node 24 + `@linha-zero/engine`) | — | Tira um job de cada vez da fila, corre A e B, grava resultado e rasters; `/healthz` em 9090 |
| `geo-pipeline` | `data-prep/` (Python 3.12), perfil `batch` | — | `build_grid.py` em lote; escreve em `web/public/grids/<nome>/` |
| `demo-seed` | `postgres:16.12-alpine`, perfil `demo` | — | Carrega `infra/demo/snapshots.csv` |

`web/public/grids/` é montado só de leitura em `/grids` na API, nos workers e na ingestão, e em `/grids/` na interface: o browser e o servidor simulam exatamente a mesma grelha.

A ingestão faz **um** pedido ao fogos.pt a cada 2 minutos e respeita o `Retry-After` de um 429 (guardado em `source_status.retry_after`, por isso um reinício não insiste). Sem `FOGOS_API_KEY` a API do fogos.pt pode responder 429; a interface mostra o erro e a ignição marca-se à mão.

## Variáveis de ambiente (`infra/.env`)

| Variável | Omissão | Significado |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `dois` | Senha do utilizador `dois` (base `dois`) |
| `FOGOS_API_KEY` | vazio | Chave do fogos.pt, enviada no header `X-API-Key`, nunca no URL |
| `INGEST_OFFLINE` | vazio | `1` = a ingestão nunca contacta as fontes; a API serve os snapshots mais recentes marcados como antigos |
| `LZ_DOMAIN` | `linhazero.localhost` | O domínio dos três endereços: `landing.`, `app.` e `account.` |
| `OIDC_CLIENT_SECRET` | `dev-secret-change-me` | O segredo do cliente `linhazero-app`, o mesmo no Keycloak e na API |
| `KEYCLOAK_DB_PASSWORD` | `keycloak` | Senha do utilizador `keycloak` (base `keycloak`) |
| `KC_BOOTSTRAP_ADMIN_PASSWORD` | `admin` | Senha do `admin` da consola do Keycloak (realm `master`); só conta no primeiro arranque |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | `dev-admin-secret-change-me` | O segredo do cliente `linhazero-api-admin`, com que a API cria as contas dos pedidos aprovados; o mesmo no Keycloak e na API |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_AUTH`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_STARTTLS`, `SMTP_SSL` | Mailpit | O servidor de email do Keycloak e da API (avisos de pedidos de acesso). Por omissão o Mailpit local; para enviar emails a sério, os dados de um serviço como o Brevo (ver `infra/.env.example`) |
| `ACCESS_REQUEST_EMAILS_PER_DAY` | 100 | Quantos emails de aviso de pedidos de acesso a API envia por dia (UTC), contando cada administrador; acima disso os pedidos ficam guardados sem aviso ([ADR 0067](../docs/decisoes/0067-email-aos-administradores-por-pedido-de-acesso.md)) |
| `INGEST_INTERVAL_<FONTE>` | 10, 10, 60, 1440, 1440, 15, 2 | Minutos entre recolhas: `IPMA_OBSERVATIONS`, `IPMA_WARNINGS`, `IPMA_RCM_D0`, `IPMA_STATIONS`, `IPMA_DISTRICTS`, `OPEN_METEO`, `FOGOS_ACTIVE` |

Todos os serviços leem a ligação ao Postgres das variáveis libpq (`PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`), definidas no compose; o worker lê `NATS_URL` e `GRIDS_DIR`; a API lê `OIDC_AUTHORITY`, `OIDC_METADATA_ADDRESS`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` e `LANDING_URL`.

## Login (Keycloak)

O porquê está na [ADR 0061](../docs/decisoes/0061-keycloak-e-sessao-no-servidor.md). O percurso: "Entrar" na landing → `app.…/api/auth/login` → página de login em `account.…` → a API recebe o código, cria o cookie de sessão e devolve o browser à aplicação. "Sair" (no menu da aplicação) termina a sessão na API e no Keycloak e volta à landing. A demo (`?scenario=…` ou `?demo`) abre sem login.

| Endereço | O quê |
| --- | --- |
| https://linhazero.localhost | Landing |
| https://app.linhazero.localhost | Aplicação (pede login, exceto a demo) |
| https://account.linhazero.localhost | Login e conta de cada utilizador (palavra-passe, segundo fator) |
| https://account.linhazero.localhost/admin | Consola de administração (`admin` / `KC_BOOTSTRAP_ADMIN_PASSWORD`); só localmente |

**Utilizador de teste:** `dev@linhazero.localhost` / `linhazero-dev` (`infra/keycloak/dev/linhazero-users-0.json`, montado só pelo compose).

**Primeira vez** (depois de `docker compose up -d --build`):

1. **Confiar na autoridade local do Caddy**, uma vez por máquina. Sem isto o browser avisa do certificado.

   macOS (Terminal):

   ```bash
   docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt /tmp/caddy-root.crt
   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /tmp/caddy-root.crt
   ```

   Windows (PowerShell **como administrador**, na pasta do repositório):

   ```powershell
   docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt "$env:TEMP\caddy-root.crt"
   Import-Certificate -FilePath "$env:TEMP\caddy-root.crt" -CertStoreLocation Cert:\LocalMachine\Root
   ```

   Depois, fechar e abrir o browser. O Chrome e o Edge usam o certificado logo; o Firefox no Windows também, se `security.enterprise_roots.enabled` estiver a `true` em `about:config`.

2. **Só para quem já tinha o volume do Postgres de antes do login** (os scripts de `infra/db/` só correm num volume vazio). Os mesmos comandos em macOS, Linux e Windows (PowerShell):

   ```bash
   docker compose cp infra/db/000_keycloak.sh postgres:/tmp/000_keycloak.sh
   docker compose exec -e KEYCLOAK_DB_PASSWORD=keycloak -e POSTGRES_USER=dois -e POSTGRES_DB=dois postgres sh /tmp/000_keycloak.sh
   docker compose cp infra/db/002_users.sql postgres:/tmp/002_users.sql
   docker compose exec postgres psql -U dois -d dois -f /tmp/002_users.sql
   docker compose up -d --build   # o Keycloak precisa da base para arrancar
   ```

   Quem não precisa dos dados antigos pode, em vez disso, começar do zero: `docker compose down -v` e `docker compose up -d --build`.

O Chrome, o Edge, o Firefox e o curl resolvem `*.localhost` sozinhos, em qualquer sistema. O Safari não: acrescentar `127.0.0.1 linhazero.localhost landing.linhazero.localhost app.linhazero.localhost account.linhazero.localhost` ao `/etc/hosts` (no Windows, outro programa que precise disto lê `C:\Windows\System32\drivers\etc\hosts`).

**No Windows:**

- O proxy precisa das portas 80 e 443. Se o `docker compose up` disser que estão ocupadas, `netstat -ano | findstr ":80 :443"` mostra o processo (muitas vezes o IIS ou o Skype antigo).
- `infra/dev-login.sh` e `infra/smoke.sh` são scripts bash: correm no Git Bash ou no WSL, não no PowerShell.
- Os scripts que correm dentro dos contentores (`*.sh`) têm de ficar com fins de linha LF; o `.gitattributes` garante-o. Quem clonou antes dessa regra e vê `set: illegal option -` no log do Postgres: `git rm --cached -r . -q; git reset --hard` (com o trabalho guardado antes).

**Dar acesso a alguém** (não há registo público): a pessoa usa "Pedir acesso" na landing; quem tem o papel `linhazero-admin` aprova o pedido na aplicação (iniciais → "Pedidos de acesso"), o que cria a conta e envia o convite por email. O percurso completo está no [README](../README.md#pedir-acesso-e-criar-contas) e o porquê na [ADR 0062](../docs/decisoes/0062-pedidos-de-acesso-e-convites-por-email.md). A API aceita no máximo 5 pedidos por hora de cada endereço (`ACCESS_REQUESTS_PER_HOUR`). Também se pode criar uma conta à mão na consola (Users → Create user → Credentials → Set password com "Temporary" ligado).

**Com curl:** `infra/dev-login.sh /tmp/lz.jar` faz o login e deixa o cookie no ficheiro; depois `curl -k -b /tmp/lz.jar -H 'X-LinhaZero: 1' https://app.linhazero.localhost/api/v1/...`. Todos os pedidos que não são GET precisam desse cabeçalho (proteção contra CSRF).

**Mudar o realm:** `infra/keycloak/linhazero-realm.json` só é importado quando o realm ainda não existe. Localmente, depois de o mudar (ou de puxar uma mudança), refazer a base do Keycloak com o passo 3 do [README](../README.md#primeira-vez). No cluster, com contas reais, muda-se na consola.

## Escalar

```bash
docker compose up -d --scale engine-worker=4   # 4× o débito, sem alterar código
docker compose up -d --scale api=2             # a API não tem estado (o progresso chega por NATS; as chaves das sessões estão no Postgres)
```

A ingestão também pode escalar (as réplicas extra ficam à espera do advisory lock e assumem se o líder cair), mas o mapeamento `127.0.0.1:8081:8081` só serve uma réplica: para `--scale ingest=2`, remove essa linha de `ports` no compose (o `smoke.sh` deixa de conseguir ler `/health/ready`).

`GET /api/v1/health` devolve `idleWorkers` = pedidos de pull à espera no consumer `engine`. Um worker a meio de um `simulate` não conta, por isso a interface considera o servidor disponível enquanto viu um worker livre nos últimos 60 s.

## Demo sem rede

Duas camadas, para que a falha de uma nunca pare a demo:

1. **Sem Docker:** `npm install && npm run dev` e tudo corre no browser (corridas únicas e o ensemble de 30 corridas). O botão "Usar o tempo de agora" diz "indisponível" e a opção "no servidor" não aparece ativa.
2. **Docker sem internet:** a API serve os snapshots gravados em `infra/demo/snapshots.csv`, com a idade real ("Vento de há N dias (sem ligação)"), e os ensembles no servidor continuam a funcionar porque as grelhas são locais.

**Gravar** (com rede, de preferência num dia com vento, depois de a ingestão ter completado um ciclo — ver os logs ou `curl localhost:8080/api/v1/weather?lat=41.45&lon=-8.29`):

```bash
docker compose exec -T postgres psql -U dois -c "\copy (select source, key, fetched_at, body, url from (select distinct on (source, key) * from snapshots where source not like 'test-%' and key not like 'test-%' order by source, key, fetched_at desc) s) to stdout csv header" > infra/demo/snapshots.csv
```

Só a linha mais recente por (fonte, chave), sem `id`, cerca de 1 MB. O `-T` desliga o pseudo-terminal, que acrescentaria `\r` e estragaria o CSV. A gravação atual é de **2026-10-17 ~15:15 UTC (vento fraco, 3,5 m/s de NE em Merelim)**, um ciclo completo da ingestão em Docker, fogos.pt incluído: convém gravar de novo num dia com mais vento antes da demo.

**Carregar** (depois de `docker compose up -d --build`, numa base vazia ou não; linhas repetidas são inofensivas):

```bash
docker compose --profile demo run --rm demo-seed
```

**Correr sem rede:** põe `INGEST_OFFLINE=1` em `infra/.env` (funciona em qualquer shell, Windows incluído) e `npm run up:offline`, que nunca faz build nem pull.

**Lista antes da demo:** com rede, `docker compose up -d --build` uma vez, para que as imagens fiquem descarregadas e construídas; gravar ou atualizar o seed; sem rede, usar só `up:offline`. Testar três vezes seguidas: botão do tempo, ocorrências, incerteza com 200 e com 500 cenários.

## Nota para o pitch

200 a 500 corridas na grelha de 100 m demoram menos de um segundo no servidor, o que um portátil também faria no browser. O caminho do servidor não é "mais rápido para um utilizador": é a arquitetura — muitos incidentes ao mesmo tempo, escalar acrescentando workers, e um rasto auditável (`runs` guarda o pedido, a hash da grelha, o worker e o resultado de cada simulação).
