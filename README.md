# LinhaZero

Ferramenta web para o Hack4Guimarães 2035 (desafio "Resposta a emergências e incêndios rurais").

Responde a uma pergunta de quem coordena um incêndio rural nos primeiros minutos:
**"Se eu tomar a decisão A ou a decisão B, o que acontece ao fogo nas próximas horas?"**

O motor simula o fogo sem combate, exceto o que se desenha, e foi validado em 80 incêndios reais do PT-FireSprd: ver [o motor explicado](docs/modelo/o-motor-explicado.md) e [o motor contra incêndios reais](docs/modelo/validacao-resumo.md).

## Como correr

Requisitos: Docker com Docker Compose 2.20 ou mais recente (o Docker Desktop já traz), e as portas 80 e 443 livres. Não é preciso Node, .NET nem Python. Funciona em macOS, Linux e Windows; o comando abaixo é o mesmo no Terminal e no PowerShell.

### Primeira vez

Todos os comandos correm na raiz do repositório.

**1. Arrancar tudo.** Demora alguns minutos (descarrega as imagens e compila tudo); as vezes seguintes arrancam em segundos. Quem tem Node pode usar `npm run up`, que faz o mesmo.

```bash
docker compose up -d --build
```

**2. Confiar no certificado local.** O HTTPS local usa uma autoridade de certificação do próprio proxy (Caddy); sem este passo o browser avisa que a ligação não é segura. Faz-se uma vez por máquina, com o passo 1 já a correr. Depois, fechar e voltar a abrir o browser.

macOS (Terminal):

```bash
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt /tmp/caddy-root.crt
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /tmp/caddy-root.crt
```

Windows (PowerShell aberto **como administrador**, na pasta do repositório):

```powershell
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt "$env:TEMP\caddy-root.crt"
Import-Certificate -FilePath "$env:TEMP\caddy-root.crt" -CertStoreLocation Cert:\LocalMachine\Root
```

No Firefox, se o aviso continuar: `about:config` → `security.enterprise_roots.enabled` → `true`. O Safari não abre `*.localhost`; usar o Chrome, o Edge ou o Firefox (ou ver as notas em [Login](infra/README.md#login-keycloak)).

**3. Só para quem já tinha a base de dados de antes.** Os scripts de `infra/db/` só correm numa base vazia, por isso uma base antiga não tem as tabelas novas, e o Keycloak só lê a configuração do repositório (`infra/keycloak/linhazero-realm.json`) quando a sua base está vazia. Estes comandos põem tudo em dia sem perder os dados da aplicação (as contas criadas no Keycloak perdem-se; o utilizador de teste volta). Os mesmos comandos no Terminal e no PowerShell; repetir sempre que um destes ficheiros mudar:

```bash
docker compose stop keycloak
docker compose exec postgres psql -U dois -d dois -c "drop database if exists keycloak"
docker compose cp infra/db/. postgres:/tmp/db/
docker compose exec -e KEYCLOAK_DB_PASSWORD=keycloak -e POSTGRES_USER=dois -e POSTGRES_DB=dois postgres sh /tmp/db/000_keycloak.sh
docker compose exec postgres psql -U dois -d dois -f /tmp/db/002_users.sql -f /tmp/db/003_access_requests.sql
docker compose up -d --build
docker compose restart api   # esquece as chaves do Keycloak antigo
```

Em alternativa, quem não precisa dos dados antigos começa do zero: `docker compose down -v` e depois `docker compose up -d --build`.

**4. Abrir.** **https://linhazero.localhost** → "Entrar", com o utilizador de teste `dev@linhazero.localhost` / `linhazero-dev` (é administrador: vê os pedidos de acesso). Os cenários de demonstração abrem sem login, só de leitura (podem ser simulados, não alterados). O Keycloak demora um minuto a ficar pronto depois de arrancar: se o "Entrar" der erro logo no início, esperar e tentar de novo.

Os emails (convites, recuperação de palavra-passe) não saem do computador: vão para uma caixa de correio falsa, em **http://localhost:8025**.

No Windows, se o passo 1 disser que as portas 80 ou 443 estão ocupadas, `netstat -ano | findstr ":80 :443"` mostra que programa as usa. Mais detalhes (pedidos de acesso, consola de administração, `npm run dev`) em [Login](infra/README.md#login-keycloak).

### Pedir acesso e criar contas

1. Na landing, **"Pedir acesso"** abre um formulário (nome, email, entidade, tipo, mensagem). O pedido fica guardado.
2. Quem administra (papel `linhazero-admin` no Keycloak) vê-o na aplicação: as iniciais no canto → **"Pedidos de acesso"**.
3. **"Aprovar e enviar convite"** cria a conta no Keycloak e envia à pessoa um email com uma ligação para escolher a palavra-passe (válida 7 dias). **"Recusar"** só marca o pedido; não envia email.
4. A pessoa escolhe a palavra-passe e entra. Se a esquecer, "Esqueceu-se da palavra-passe?" na página de login envia uma ligação nova.

Para tornar alguém administrador: consola do Keycloak (https://account.linhazero.localhost/admin, `admin` / `admin`) → realm `linhazero` → Users → a pessoa → Role mapping → Assign role → `linhazero-admin`. A pessoa tem de sair e entrar de novo.

### O que arranca

| Serviço | O que faz | Endereço |
| --- | --- | --- |
| `proxy` | A entrada HTTPS (Caddy): encaminha cada endereço para o seu serviço | portas 80 e 443 |
| `landing` | A página de apresentação (nginx) | https://linhazero.localhost |
| `web` | A interface (nginx) | https://app.linhazero.localhost |
| `keycloak` | O login e a conta de cada utilizador | https://account.linhazero.localhost |
| `api` | API REST + SSE (.NET 10); documentação interativa (Swagger UI) | https://app.linhazero.localhost/api/docs |
| `ingest` | Recolhe o tempo (IPMA, Open-Meteo) e as ocorrências (fogos.pt) | 127.0.0.1:8081 |
| `engine-worker` | Corre o motor para os ensembles pedidos ao servidor | — |
| `mailpit` | Caixa de correio falsa: mostra os emails que o Keycloak envia | http://localhost:8025 |
| `postgres` | Base de dados: snapshots das fontes, corridas, utilizadores e pedidos de acesso | 127.0.0.1:5432 |
| `nats` | Fila de trabalho entre a API e os workers | 127.0.0.1:4222 |

Com tudo a correr, o tempo vem em direto do IPMA e do Open-Meteo, as ocorrências do fogos.pt aparecem nos mapas e a incerteza corre no servidor, com 200 a 500 cenários por decisão. Sem workers disponíveis, a incerteza fica desligada; se o servidor falhar a meio, cada decisão corre uma vez no browser, sem incerteza.

Para parar:

```bash
docker compose down        # mantém os dados; `docker compose down -v` apaga-os
```

Configuração opcional (chave do fogos.pt, modo sem rede, intervalos da ingestão): copia `infra/.env.example` para `infra/.env`. Portas, escalar workers e a demo sem rede estão em [`infra/README.md`](infra/README.md).

### Desenvolver a interface

Para mexer na interface ou no motor com recarregamento automático (requisitos: Node.js 20.19 ou mais recente):

```bash
npm install
npm run dev     # http://localhost:5173
```

O `npm run dev` corre só a interface. Se os serviços estiverem a correr (`docker compose up -d`), encaminha `/api` para a API em http://localhost:8080. Sem eles, as corridas únicas correm no browser, sem internet nem Docker; o painel do tempo diz "sem tempo em direto" e os valores introduzem-se à mão, e "Considerar a incerteza" fica desativado (a incerteza corre só no servidor). Para desenvolver os serviços fora dos contentores: .NET 10 SDK e Node 24.

### Outros comandos

| Comando | O que faz |
| --- | --- |
| `npm run up` / `npm run down` | O mesmo que `docker compose up -d --build` / `docker compose down` |
| `npm run dev:landing` / `npm run build:landing` | A página de apresentação (`landing/`), com o relevo 3D no topo; ver [o plano](docs/plano/landing.md) |
| `npm run logs` | Logs de todos os serviços |
| `npm run up:offline` | Arranca sem build nem pull (demo sem rede, ver `infra/README.md`) |
| `npm run test` | Testes do motor (Vitest) |
| `npm run test:worker` | Testes do worker do motor (Vitest) |
| `npm run test:backend` | Testes dos serviços .NET (xUnit; com `TEST_PG=1` também os de Postgres e NATS, contra o compose a correr) |
| `npm run bench` | Mede o tempo de uma simulação e de um ensemble |
| `npm run grid:synthetic` | Volta a gerar a grelha sintética de teste em `web/public/grids/sintetica/` (só para os testes, o bench e o smoke; a interface não a mostra) |
| `npm run typecheck` | Verifica os tipos do motor, da interface e do worker |
| `npm run lint` | ESLint |
| `npm run build` | Compila a interface para `web/dist/` |
| `infra/smoke.sh --fresh` | Teste ponta a ponta do compose |

A CI (`.github/workflows/ci.yml`) corre o typecheck, o lint, os testes (motor e serviços .NET) e o build em cada push para `master` e em cada pull request.

## Usar

1. A grelha é "Guimarães (dados reais)"; também podes carregar um cenário guardado.
2. **Acender fogo** e clica num dos mapas.
3. O tempo é o de agora, por omissão: ao abrir, no centro da zona; ao acender o fogo, no ponto de ignição. Vem da
   estação IPMA mais próxima com vento nas últimas 2 h (ou do modelo Open-Meteo), com a temperatura e a humidade da
   estação mais próxima que as mede, a nebulosidade, o risco de incêndio, os avisos e as próximas horas. Cada valor
   (direção e velocidade do vento, temperatura, humidade, nuvens, secura do combustível) pode ser mudado à mão; fica
   marcado e mantém-se quando o tempo se atualiza, até carregares em "repor". Escolhe também a duração.
   "Ocorrências ativas (fogos.pt)" mostra os fogos em curso na zona; clicar num põe lá a ignição.
4. Para cada decisão, desenha ações no mapa respetivo: **Linha de contenção**, **Ataque** ou **Proteger zona**,
   com o minuto de início. Para terminar, faz duplo clique ou carrega em Enter; Esc cancela.
5. **Simular**. Com os serviços a correr, "Considerar a incerteza" vem ligado: cada decisão corre no servidor com os cenários escolhidos na barra (200 a 500), o painel diz em quantos cenários cada decisão é melhor, e a simulação fica no histórico. Desligado (ou sem workers), cada decisão corre uma vez no browser e não fica guardada. A incerteza corre sempre no servidor, e as variantes de grelha também. No fim, a barra de tempo anda da ignição até ao fim.
6. **Porque o fogo chega aqui:** no resultado, toca num ponto do mapa, ou num lugar da tabela. Os mapas mostram o caminho que o fogo fez até lá, e o painel diz quanto tempo levou e o que pesou na velocidade (combustível, vento, declive).
7. **Histórico de simulações** (menu da barra de cima, com sessão): as tuas simulações com incerteza, as mais recentes primeiro, com a área ardida e os edifícios de A e B. **Abrir** repõe o fogo, as decisões desenhadas e as condições e mostra o resultado guardado, sem simular de novo, com a barra de tempo a andar do início ao fim; daí podes mudar o que quiseres e simular outra vez. Quem tem o papel `linhazero-admin` pode ver as de todas as pessoas ([ADR 0073](docs/decisoes/0073-historico-de-simulacoes.md)).
8. **Sugerir uma terceira decisão:** no resultado, escolhe a decisão de partida, quando uma linha pode estar pronta e com que largura, e carrega em "Procurar linhas". O simulador experimenta linhas de contenção no caminho do fogo e mostra as que mais poupam; "Pôr na decisão B" (ou A) leva a sugestão para a comparação.
9. **Assistente** (botão no canto inferior direito dos mapas, com sessão, quando o servidor tem uma chave da Anthropic em `ANTHROPIC_API_KEY`): uma conversa ao lado dos mapas que vê o que está no ecrã. Explica o resultado e porque é que uma decisão ganha (o que cada ação contribui), revê um plano (as chamas que cada ação enfrenta e a largura de linha que as seguraria), testa se a resposta muda com outro vento, diz até quando uma ação ainda serve, propõe uma decisão B e escreve um resumo para o COS. Põe ações em qualquer sítio (aldeias, cabeça ou flancos do fogo, ou a uma distância de um lugar), estica as linhas até uma estrada, rio ou zona sem combustível, e escolhe o sítio comparando várias opções no motor. Os números vêm sempre do simulador. As ações que coloca ficam marcadas a âmbar no mapa e com "assistente" no cartão; "Desfazer" repõe as decisões. Cada pessoa tem um limite diário de gasto ([ADR 0079](docs/decisoes/0079-assistente-com-claude-haiku.md), [0081](docs/decisoes/0081-assistente-coloca-acoes-em-qualquer-sitio.md), [0082](docs/decisoes/0082-assistente-explica-decisoes.md)).

Um cenário em `web/public/scenarios/` (listado em `index.json`) abre com `https://app.linhazero.localhost/?scenario=<nome>` (ou `http://localhost:5173/?scenario=<nome>` com `npm run dev`), sem login e só de leitura ([ADR 0080](docs/decisoes/0080-demonstracao-so-de-leitura.md)); `?demo` abre o primeiro. Os cenários de demonstração são incêndios reais (Alijó 2019, Vieira do Minho 2016): a simulação parte da ignição e do tempo reais, e a camada "Fogo real" mostra o perímetro observado à hora da barra de tempo.

### Editor de grelha

No botão **Editor de grelha** (ou `#/grelha`):

1. Escolhe a grelha. Passa o rato sobre o mapa para ver o que a grelha diz em cada ponto: combustível, velocidade, altitude, declive, barreira, edifícios e lugar. **Ver** troca entre combustível (com legenda), relevo, declive e lugares; **Camadas** tem o mesmo mapa de ruas, satélite, curvas de nível e relevo 3D da simulação.
2. Para experimentar alterações, escolhe as células: **Selecionar células** (tocar ou arrastar, com pincel de 1, 3×3 ou 5×5; tocar numa célula selecionada retira-a) ou **Selecionar uma área**. Depois: **Tornar não combustível**, **Pôr o combustível escolhido**, **Acrescentar barreira** ou **Tirar barreiras**. **Desenhar uma barreira** traça uma linha nova. **Desfazer** e **Refazer** (Ctrl+Z, Ctrl+Shift+Z) valem para tudo. Em **Valores** mudam-se os coeficientes do modelo (os principais à vista, o resto em "Avançado"). A grelha oficial nunca muda: o resultado é uma variante.
3. **Guardar** (neste browser), **Exportar** ou **Importar** a variante.
4. **Testar na simulação**: abre a simulação com a decisão A na grelha oficial e a B na variante. Em cada decisão, "Grelha" escolhe a oficial ou uma variante guardada.

## Dados reais

Ver `data-prep/README.md`. A grelha de Guimarães já está gerada em `web/public/grids/guimaraes/`.

## Estrutura

```
engine/         motor de propagação (TypeScript puro), tipos, ficheiros de cenário, variantes de grelha e contratos partilhados, testes
web/            interface React + MapLibre (Simulação e Editor de grelha); o motor corre num Web Worker; Dockerfile + nginx.conf servem-na em contentor
engine-worker/  worker Node que corre o mesmo motor a partir da fila NATS (um job de cada vez)
backend/        .NET 10: src/LinhaZero.Core (parsers, snapshots, lock de líder, grelhas), LinhaZero.Api (controladores, OpenAPI), LinhaZero.Ingest; tests/LinhaZero.Tests
contracts/      exemplos JSON dos contratos entre interface, API e worker (fonte de verdade dos tipos)
infra/          docker-compose (incluído pelo compose.yaml da raiz), esquema SQL, seed da demo, smoke.sh
data-prep/      scripts Python que geram web/public/grids/<zona>/ a partir de dados reais (também em contentor)
docs/           documentação: proposta, arquitetura, modelo do fogo, referência, plano e decisões
```

A interface e o motor funcionam sozinhos no browser. Os serviços (API e ingestão em .NET, workers do motor, PostgreSQL e
NATS) acrescentam o tempo real, as ocorrências e os ensembles grandes; a arquitetura está em
[docs/arquitetura/](docs/arquitetura/README.md) e a documentação começa em [docs/README.md](docs/README.md).

## Licença

© 2026 José Sampaio e Rodrigo Vicente. Todos os direitos reservados: o código está público só para consulta e não
pode ser usado, copiado nem modificado sem autorização escrita dos autores (ver [LICENSE](LICENSE)). Os dados de
terceiros mantêm as suas licenças, abaixo.

## Créditos dos dados

O LinhaZero usa dados de terceiros, cada um com a sua licença. As grelhas em `web/public/grids/` e
`engine/test/reference*/`, as fixtures dos testes e a seed da demo (`infra/demo/`) incluem dados derivados destas fontes.

| Dado | Fonte e crédito | Licença |
| --- | --- | --- |
| Modelos de combustível | FUMOD: Sá, A.C.L. et al., *A method to produce a flexible and customized fuel models dataset*, MethodsX; dados em [github.com/anasa30/PT_FuelModels](https://github.com/anasa30/PT_FuelModels) | Sem licença declarada; usados com crédito aos autores |
| Relevo | Copernicus DEM GLO-30: "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" | Licença do Copernicus DEM GLO-30: acesso livre e gratuito, com esta atribuição |
| Coberto arbóreo | Copernicus High Resolution Layer Tree Cover Density 2018: © European Union, Copernicus Land Monitoring Service 2018, European Environment Agency (EEA) | Acesso livre e gratuito, com atribuição |
| Estradas, rios, edifícios, lugares e mapa de ruas | © contribuidores do [OpenStreetMap](https://www.openstreetmap.org/copyright) | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/): as camadas derivadas do OSM nas grelhas (barreiras, edifícios, lugares) ficam sob a ODbL |
| Ortofotografia (vista satélite) | OrtoSat 2023 © Direção-Geral do Território (DGT) | Dados abertos da DGT |
| Incêndios de referência | PT-FireSprd v0.08: Benali, A. et al. (2023), [doi:10.5281/zenodo.7495506](https://doi.org/10.5281/zenodo.7495506) | CC BY 4.0 |
| Tempo (previsão e arquivo) | [Open-Meteo.com](https://open-meteo.com/); o arquivo histórico usa o ERA5 do Copernicus Climate Change Service | CC BY 4.0 |
| Observações, avisos e risco de incêndio | Instituto Português do Mar e da Atmosfera ([IPMA](https://api.ipma.pt/)) | Dados abertos do IPMA |
| Ocorrências ativas | [fogos.pt](https://fogos.pt/) (VOST Portugal), a partir dos dados da ANEPC | Termos de utilização do fogos.pt |
| Fotografias da página inicial | Autores e licenças em `landing/public/photos/credits.json` (NASA MODIS, Wikimedia Commons) | Domínio público e CC BY-SA |
| Tipo de letra Barlow | Jeremy Tribby | SIL Open Font License 1.1 (`web/src/fonts/OFL.txt`) |

As bibliotecas de código (npm e NuGet) têm as suas próprias licenças, indicadas em cada pacote. As referências
científicas estão em [docs/bibliografia.md](docs/bibliografia.md).

## Aviso

O simulador é uma aproximação coerente e explicável, não uma previsão operacional.
Os coeficientes do modelo (`engine/src/params.ts`) e as velocidades por combustível são
provisórios e têm de ser calibrados contra incêndios reais.
