# LinhaZero no Kubernetes (`infra/k8s/`)

O mesmo stack do `docker compose`, num cluster (o k3s de casa), atrás de um **Cloudflare Tunnel**: o `cloudflared` corre no cluster e liga-se para fora à Cloudflare, por isso não se abre nenhuma porta na rede de casa e o HTTPS é da Cloudflare. Não é preciso ingress controller: o túnel encaminha cada endereço diretamente para o seu serviço. Cada push para `main` constrói as imagens e põe-nas no cluster sozinho ([Atualizar](#atualizar)).

| Endereço | Serviço | O quê |
| --- | --- | --- |
| `linhazero.dev` | `landing` | A entrada, pública (`www.` e `landing.` redirecionam para aqui) |
| `app.linhazero.dev/api/…` | `api` | API REST + SSE e o login (`/api/auth/…`) |
| `app.linhazero.dev` | `web` | A aplicação (pede login, exceto a demo) |
| `account.linhazero.dev/realms/…`, `/resources/…` | `keycloak` | Login e conta; a consola de administração **não** é publicada |

O porquê do login está na [ADR 0061](../../docs/decisoes/0061-keycloak-e-sessao-no-servidor.md). A configuração está em [`../kustomization.yaml`](../kustomization.yaml) (em `infra/` porque o kustomize só lê ficheiros abaixo dele, e os scripts da base estão em `infra/db/`); o domínio, num só sítio, em [`config.env`](config.env).

Os passos 1 a 7 fazem-se uma vez. Os comandos correm na raiz do repositório, com o `kubectl` apontado ao cluster (no Windows, no Git Bash).

## 1. Domínio na Cloudflare

O domínio tem de usar a DNS da Cloudflare (plano gratuito): adicioná-lo à conta e mudar os *nameservers* no registo onde foi comprado. O `linhazero.dev` já está.

## 2. Imagens

O workflow [`images.yml`](../../.github/workflows/images.yml) constrói as sete imagens e publica-as em `ghcr.io/josesampaio27/linhazero-<nome>`, com as etiquetas `main` e o sha do commit, a cada push para `main`; para correr já: Actions → Images → Run workflow. As imagens não levam o domínio: as páginas descobrem `app.` e `account.` a partir do seu próprio endereço, e a API e o Keycloak leem-no do `config.env`. Só para nós ARM: no GitHub, Settings → Secrets and variables → Actions → **Variables**, `IMAGE_PLATFORMS` = `linux/amd64,linux/arm64`.

O repositório é privado, e os pacotes do GHCR também: o cluster recebe uma credencial, um *token* clássico (GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)) só com `read:packages`:

```bash
kubectl create namespace linha-zero
kubectl -n linha-zero create secret docker-registry ghcr --docker-server=ghcr.io --docker-username=josesampaio27 --docker-password=<token>
kubectl -n linha-zero patch serviceaccount default -p '{"imagePullSecrets":[{"name":"ghcr"}]}'
```

Se o repositório mudar de dono, mudar `ghcr.io/josesampaio27` em `images:` no `kustomization.yaml` e em `infra/runner/scale-set.yaml`.

## 3. Túnel

Cloudflare → Zero Trust → Networks → Tunnels → Create a tunnel (Cloudflared), por exemplo `linhazero-homelab`. Copiar o **token** do comando de instalação (não é preciso instalar nada: o `cloudflared` corre no cluster). Depois, em **Public hostnames** (ou *Published application routes*), por esta ordem (as mais específicas primeiro):

| Subdomínio | Caminho (*path*) | Serviço |
| --- | --- | --- |
| `app` | `^/api/` | `http://api.linha-zero.svc.cluster.local:8080` |
| `app` | | `http://web.linha-zero.svc.cluster.local:8080` |
| `account` | `^/(realms\|resources)/` | `http://keycloak.linha-zero.svc.cluster.local:8080` |
| (vazio, o domínio) | | `http://landing.linha-zero.svc.cluster.local:8080` |
| `www` | | `http://landing.linha-zero.svc.cluster.local:8080` |
| `landing` | | `http://landing.linha-zero.svc.cluster.local:8080` |

O resto de `account.` (incluindo `/admin`) não tem rota e responde 404. O progresso das corridas (SSE) passa pela Cloudflare porque a API manda um *ping* a cada 15 s, abaixo dos 100 s que a Cloudflare espera.

`www.` e `landing.` mandam para o domínio: no painel do domínio, Rules → Redirect Rules → Create rule (*Single Redirect*):

- **Se**: *Custom filter expression* → `(http.host in {"www.linhazero.dev" "landing.linhazero.dev"})`
- **Então**: *Dynamic*, `concat("https://linhazero.dev", http.request.uri.path)`, código **301**, *Preserve query string* ligado.

Em SSL/TLS → Edge Certificates, deixar *Always Use HTTPS* ligado.

## 4. Configuração e segredos

O [`config.env`](config.env) já tem `LZ_DOMAIN=linhazero.dev`. Os segredos ficam só no cluster: criam-se uma vez a partir de um ficheiro que fica fora do git, e o *deploy* automático nunca os vê.

```bash
cp infra/k8s/secrets.env.example infra/k8s/secrets.env
$EDITOR infra/k8s/secrets.env      # cada senha com: openssl rand -base64 24; TUNNEL_TOKEN do passo 3; SMTP_PASSWORD vazio
kubectl -n linha-zero create secret generic linhazero-secrets --from-env-file=infra/k8s/secrets.env
```

Sem `FOGOS_API_KEY` ([pedir aqui](https://api.fogos.pt/api/request-access)) os incêndios ativos do fogos.pt respondem HTTP 429; o resto funciona.

Para mudar um segredo mais tarde:

```bash
kubectl -n linha-zero create secret generic linhazero-secrets --from-env-file=infra/k8s/secrets.env --dry-run=client -o yaml | kubectl apply -f -
kubectl -n linha-zero rollout restart deployment
```

(As senhas do Postgres só contam no primeiro arranque, com o volume vazio: mudá-las depois exige também `ALTER ROLE` na base.)

### Email

O Keycloak envia os convites dos pedidos de acesso e as ligações de recuperação de palavra-passe, pelo [Brevo](https://www.brevo.com) (plano gratuito, 300 emails por dia), como `linhazero@linhazero.dev`. O domínio está autenticado no Brevo com registos na DNS da Cloudflare (`brevo-code`, DKIM `brevo1`/`brevo2._domainkey` em *DNS only*, DMARC); o login SMTP está no `config.env` e a chave SMTP em `SMTP_PASSWORD` no segredo.

Para o configurar de novo (outra conta ou outro serviço): no Brevo, verificar o domínio (ou um endereço) como remetente, e em SMTP & API criar uma chave SMTP. O realm só é importado no **primeiro** arranque do Keycloak, por isso, com ele já a correr, configura-se na consola (passo 6): realm `linhazero` → Realm settings → Email → host `smtp-relay.brevo.com`, porta `587`, *From* = o endereço verificado, *Enable StartTLS*, *Authentication* com o login SMTP e a chave → *Test connection*. Para que uma instalação nova já nasça com email, pôr os mesmos valores no `config.env` (`SMTP_HOST`, `SMTP_USER`, `SMTP_AUTH=true`, `SMTP_STARTTLS=true`) e a chave em `SMTP_PASSWORD` no segredo.

## 5. Primeiro deploy

```bash
git fetch origin
bash infra/k8s/deploy.sh            # as imagens do último commit de origin/main
kubectl -n linha-zero get pods -w   # o keycloak demora um ou dois minutos no primeiro arranque
```

O [`deploy.sh`](deploy.sh) aplica `infra/` com as imagens do commit indicado (por omissão o de `origin/main`; as imagens desse commit têm de existir) e espera que tudo arranque. É o mesmo script que o *deploy* automático corre.

Os volumes do Postgres (5 GB) e do NATS (1 GB) usam a *storage class* por omissão do cluster (no k3s, `local-path`, um disco de um dos nós). Os scripts de `infra/db/` correm só no primeiro arranque do Postgres, com o volume vazio.

## 6. Primeiro utilizador

A consola de administração não está na internet. Para lá chegar:

```bash
kubectl -n linha-zero port-forward svc/keycloak 8080:8080
# http://localhost:8080/admin  →  admin / KC_BOOTSTRAP_ADMIN_PASSWORD
```

O primeiro administrador cria-se à mão: realm `linhazero` → Users → Create user (o teu email como nome de utilizador, "Email verified" ligado) → Credentials → Set password, com "Temporary" ligado → Role mapping → Assign role → `linhazero-admin`.

Com email ligado, as outras contas nascem dos pedidos: a pessoa usa "Pedir acesso" na landing, e o administrador aprova-o na aplicação (iniciais → "Pedidos de acesso"), o que cria a conta e envia o convite por email ([ADR 0062](../../docs/decisoes/0062-pedidos-de-acesso-e-convites-por-email.md)). Sem email, criar cada conta como acima (sem o papel `linhazero-admin`) e dar a palavra-passe temporária à pessoa.

## 7. Runner (o *deploy* automático)

Um runner do GitHub Actions dentro do cluster ([`infra/runner/`](../runner/), o Actions Runner Controller, instalado pelo próprio k3s): o GitHub não precisa de chegar a casa, é o runner que se liga para fora. Só pode aplicar `infra/` no namespace `linha-zero` e ver o rollout; não lê segredos.

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate: *Repository access* só `LinhaZero`, *Permissions* → *Administration*: **Read and write** (é o que regista runners num repositório). Validade à escolha: quando expirar, repetir o passo 2 com um novo.
2. ```bash
   kubectl create namespace arc-runners
   kubectl -n arc-runners create secret generic arc-github --from-literal=github_token=<token>
   kubectl apply -k infra/runner
   kubectl -n arc-systems get pods          # o controlador
   kubectl -n arc-runners get pods          # o listener (homelab-…-listener)
   ```
3. No GitHub, Settings → Actions → Runners: aparece o *scale set* `homelab`. Os pods dos runners só existem enquanto um job corre.

## Atualizar

Automático: cada push para `main` corre o workflow Images, que constrói as imagens com o sha do commit e, no fim, o job `deploy` corre `infra/k8s/deploy.sh <sha>` no runner `homelab`. O progresso vê-se em Actions → Images, e no cluster com `kubectl -n linha-zero get pods`.

- **Voltar atrás**: Actions → Images → o run de um commit anterior → *Re-run all jobs*; ou à mão, `bash infra/k8s/deploy.sh <sha>`.
- **Mudar a configuração** (`config.env`, réplicas, recursos, …): editar os ficheiros e fazer push para `main`, como para o código. `kubectl edit`/`scale` à mão são desfeitos pelo próximo *deploy*.
- O Keycloak não muda o realm de um arranque para o outro (só o importa se não existir): alterações a `linhazero-realm.json` fazem-se também na consola.

## Escalar

Mudar `replicas:` em `engine-worker.yaml` (a capacidade de simulação cresce com as réplicas) ou em `api.yaml` (as chaves das sessões estão no Postgres) e fazer push. O cluster de casa tem 2 nós de 2 CPU e ~4 GB: cada `engine-worker` reserva meio CPU.

O Keycloak fica com uma réplica (mais exigiria configurar a cache partilhada). Uma cópia de segurança diária da base (`pg_dump`) é o próximo passo recomendado: o Postgres guarda os utilizadores e as corridas num disco de casa.
