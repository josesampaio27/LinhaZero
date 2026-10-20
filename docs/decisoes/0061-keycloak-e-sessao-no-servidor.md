# ADR 0061: Login com Keycloak e sessão guardada pela API

- Estado: aceite
- Data: 2026-10-20
- Concretiza a [identidade](../arquitetura/08-conceitos.md#identidade-e-separação-entre-entidades) planeada: um só emissor OpenID Connect, com o Keycloak como intermediário

## Contexto

A aplicação e a landing estavam abertas a todos. O objetivo são três endereços: `landing.<domínio>` (a entrada, pública), `account.<domínio>` (o login) e `app.<domínio>` (a aplicação, só com sessão). O cenário de demonstração continua a abrir sem login, como a landing promete. Tem de correr igual num portátil (Docker Desktop) e no cluster Kubernetes, atrás de um Cloudflare Tunnel.

## Decisão

- **Keycloak 26 em `account.<domínio>`** é o único emissor OpenID Connect em que a API confia. O realm `linhazero` está no repositório (`infra/keycloak/linhazero-realm.json`) e é importado no primeiro arranque. **Sem registo público:** as contas criam-se depois de um "Pedir acesso". Proteção contra força bruta, política de palavras-passe (12 caracteres no mínimo), TOTP e passkeys disponíveis. A página de login usa o tema `linhazero` (cores, letras e logótipo da landing, em português).
- **A API é o cliente OpenID Connect** (fluxo *authorization code* com PKCE, cliente confidencial). Guarda a sessão num cookie seu, `__Host-lz_session`: HttpOnly, Secure, `SameSite=Lax`, só no anfitrião `app.<domínio>`, cifrado com chaves de Data Protection guardadas no Postgres (`data_protection_keys`), para todas as réplicas o lerem. O cookie dura 8 h desde a última atividade e nunca mais de 12 h desde o login. **O browser nunca recebe um token.**
- **Tudo na API pede sessão** (política por omissão), exceto `/api/v1/health` e `/api/auth/*`. Sem sessão, a API responde 401 em JSON; é a interface que decide mandar para o login (`/api/auth/login?returnUrl=…`, só caminhos locais).
- **CSRF:** além do `SameSite=Lax`, todos os pedidos que não são GET levam o cabeçalho `X-LinhaZero: 1`, que um formulário de outro site não consegue pôr.
- **O utilizador** é criado na tabela `users` no primeiro login (emissor + `sub`). Papéis e entidades (`memberships`) ficam para a função de autorização do [caminho para produção](../plano/caminho-para-producao.md).
- **A demo** (`?scenario=…` ou `?demo`) abre sem sessão e corre no motor do browser; o resto da interface manda para o login.
- **Localmente**, um Caddy (`infra/Caddyfile`) faz de Cloudflare e de ingress: HTTPS com uma autoridade local, encaminhado pelo nome (`*.linhazero.localhost`). No cluster, o túnel só encaminha `/realms/` e `/resources/` do Keycloak; a consola de administração não fica pública.

## Porquê

- Já era a direção da arquitetura: federar mais tarde o fornecedor de cada entidade e o Autenticação.gov é configuração no Keycloak, sem tocar na API.
- O Keycloak traz o que não vale a pena escrever: bloqueio por tentativas, TOTP, passkeys, sessões, consola de conta. Gasta cerca de 0,5 a 1 GB de memória.
- Com a sessão no servidor, um script injetado na página não consegue roubar um token, e logout é mesmo logout: o cookie apaga-se e a sessão do Keycloak termina.
- Um cookie só do anfitrião `app.` evita partilhar cookies entre subdomínios; o single sign-on vem da sessão que o Keycloak guarda em `account.`.

## Alternativas consideradas

- **ASP.NET Core Identity dentro da API, com uma página de conta própria:** menos um serviço e controlo total do aspeto, mas teríamos de escrever recuperação de palavra-passe, segundo fator e bloqueio, e afastava-se do plano de federar fornecedores.
- **Serviço gerido (Auth0, Entra ID, Clerk):** nada a correr, mas os dados saem da infraestrutura própria, há limites nos planos gratuitos e fica-se dependente do fornecedor.
- **Tokens no browser (SPA com PKCE e access token em memória):** mais simples na API, mas o token fica ao alcance de qualquer script na página e é preciso renová-lo no browser.
- **Cookie no domínio pai (`.<domínio>`), partilhado pelos três endereços:** desnecessário (a landing não precisa de saber quem entrou) e qualquer subdomínio o poderia sobrepor.

## Consequências

- `smoke.sh` entra pelo HTTPS local e faz login com `infra/dev-login.sh`.
- Mudanças em `linhazero-realm.json` só se aplicam a um realm novo (o import ignora o que já existe); num realm existente, mudam-se na consola de administração.
- Sem servidor de email, não há "esqueci-me da palavra-passe": quem administra define uma nova. Fica para quando houver SMTP.
