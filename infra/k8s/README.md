# LinhaZero no Kubernetes (`infra/k8s/`)

O mesmo stack do `docker compose`, num cluster, atrás de um **Cloudflare Tunnel**: o `cloudflared` corre no cluster e liga-se para fora à Cloudflare, por isso não se abre nenhuma porta na rede de casa e o HTTPS é da Cloudflare. Não é preciso ingress controller: o túnel encaminha cada endereço diretamente para o seu serviço.

| Endereço | Serviço | O quê |
| --- | --- | --- |
| `landing.<domínio>` (e `<domínio>`) | `landing` | A entrada, pública |
| `app.<domínio>/api/…` | `api` | API REST + SSE e o login (`/api/auth/…`) |
| `app.<domínio>` | `web` | A aplicação (pede login, exceto a demo) |
| `account.<domínio>/realms/…`, `/resources/…` | `keycloak` | Login e conta; a consola de administração **não** é publicada |

O porquê do login está na [ADR 0061](../../docs/decisoes/0061-keycloak-e-sessao-no-servidor.md). A configuração está em [`../kustomization.yaml`](../kustomization.yaml) (em `infra/` porque o kustomize só lê ficheiros abaixo dele, e os scripts da base estão em `infra/db/`).

## 1. Domínio na Cloudflare

O domínio tem de usar a DNS da Cloudflare (plano gratuito): adicioná-lo à conta e mudar os *nameservers* no registo onde foi comprado.

## 2. Imagens

O workflow [`images.yml`](../../.github/workflows/images.yml) constrói as sete imagens e publica-as em `ghcr.io/<dono>/linhazero-<nome>`, com as etiquetas `main` e o sha do commit, a cada push para `main`.

1. No GitHub, Settings → Secrets and variables → Actions → **Variables**: `LZ_DOMAIN` = o domínio (fica dentro das páginas compiladas). Para nós ARM, `IMAGE_PLATFORMS` = `linux/amd64,linux/arm64`.
2. Correr o workflow (Actions → Images → Run workflow).
3. Os pacotes do GHCR nascem privados. Ou se tornam públicos (Packages → cada pacote → Package settings), ou o cluster recebe uma credencial (um *token* clássico com `read:packages`):

   ```bash
   kubectl create namespace linha-zero
   kubectl -n linha-zero create secret docker-registry ghcr --docker-server=ghcr.io --docker-username=<utilizador> --docker-password=<token>
   kubectl -n linha-zero patch serviceaccount default -p '{"imagePullSecrets":[{"name":"ghcr"}]}'
   ```

Se o repositório mudar de dono, mudar `ghcr.io/josesampaio27` em `images:` no `kustomization.yaml`.

## 3. Túnel

Cloudflare → Zero Trust → Networks → Tunnels → Create a tunnel (Cloudflared). Dar-lhe um nome, copiar o **token** do comando de instalação (não é preciso instalar nada: o `cloudflared` corre no cluster). Depois, em **Public hostnames**, por esta ordem (as mais específicas primeiro):

| Subdomínio | Caminho (*path*) | Serviço |
| --- | --- | --- |
| `landing` | | `http://landing.linha-zero.svc.cluster.local:8080` |
| (vazio, o domínio) | | `http://landing.linha-zero.svc.cluster.local:8080` |
| `app` | `^/api/` | `http://api.linha-zero.svc.cluster.local:8080` |
| `app` | | `http://web.linha-zero.svc.cluster.local:8080` |
| `account` | `^/(realms\|resources)/` | `http://keycloak.linha-zero.svc.cluster.local:8080` |

O resto de `account.` (incluindo `/admin`) não tem rota e responde 404. O progresso das corridas (SSE) passa pela Cloudflare porque a API manda um *ping* a cada 15 s, abaixo dos 100 s que a Cloudflare espera.

## 4. Configuração e segredos

```bash
# O domínio, num só sítio:
$EDITOR infra/k8s/config.env                          # LZ_DOMAIN=o-teu-dominio.pt
cp infra/k8s/secrets.env.example infra/k8s/secrets.env  # fica fora do git
$EDITOR infra/k8s/secrets.env                         # senhas (openssl rand -base64 24), o token do túnel
```

## 5. Aplicar

```bash
kubectl apply -k infra
kubectl -n linha-zero get pods -w        # o keycloak demora um ou dois minutos no primeiro arranque
```

Os volumes do Postgres (5 GB) e do NATS (1 GB) usam a *storage class* por omissão do cluster (no k3s, `local-path`). Os scripts de `infra/db/` correm só no primeiro arranque do Postgres, com o volume vazio.

## 6. Primeiro utilizador

A consola de administração não está na internet. Para lá chegar:

```bash
kubectl -n linha-zero port-forward svc/keycloak 8080:8080
# http://localhost:8080/admin  →  admin / KC_BOOTSTRAP_ADMIN_PASSWORD
```

Realm `linhazero` → Users → Create user (email como nome de utilizador) → Credentials → Set password, com "Temporary" ligado. Não há registo público: cada pessoa entra depois de um "Pedir acesso".

## Atualizar

Cada push para `main` publica imagens novas com a etiqueta `main`; as nossas imagens têm `imagePullPolicy: Always`, por isso basta reiniciar:

```bash
kubectl -n linha-zero rollout restart deployment
```

Para fixar uma versão, trocar `newTag: main` pelo sha do commit no `kustomization.yaml`.

## Escalar

```bash
kubectl -n linha-zero scale deployment engine-worker --replicas=4
kubectl -n linha-zero scale deployment api --replicas=3   # as chaves das sessões estão no Postgres
```

O Keycloak fica com uma réplica (mais exigiria configurar a cache partilhada). Uma cópia de segurança diária da base (`pg_dump`) é o próximo passo recomendado: o Postgres guarda os utilizadores e as corridas num disco de casa.
