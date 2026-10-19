# LinhaZero

Ferramenta web para o Hack4Guimarães 2035 (desafio "Resposta a emergências e incêndios rurais").

Responde a uma pergunta de quem coordena um incêndio rural nos primeiros minutos:
**"Se eu tomar a decisão A ou a decisão B, o que acontece ao fogo nas próximas horas?"**

O motor simula o fogo sem combate, exceto o que se desenha, e foi validado em 80 incêndios reais do PT-FireSprd: ver [o motor explicado](docs/modelo/o-motor-explicado.md) e [o motor contra incêndios reais](docs/modelo/validacao-resumo.md).

## Como correr

Requisitos: Docker com Docker Compose 2.20 ou mais recente (o Docker Desktop já traz). Não é preciso Node, .NET nem Python.

Na raiz do repositório:

```bash
docker compose up -d --build
```

Abre **http://localhost:3000**. A primeira vez demora alguns minutos (descarrega as imagens e compila tudo); as seguintes arrancam em segundos. Quem tem Node pode usar `npm run up`, que faz o mesmo.

Este comando arranca tudo:

| Serviço | O que faz | Endereço |
| --- | --- | --- |
| `web` | A interface (nginx), que encaminha `/api` para a API | http://localhost:3000 |
| `api` | API REST + SSE (.NET 10); documentação interativa (Swagger UI) | http://localhost:3000/api/docs |
| `ingest` | Recolhe o tempo (IPMA, Open-Meteo) e as ocorrências (fogos.pt) | 127.0.0.1:8081 |
| `engine-worker` | Corre o motor para os ensembles pedidos ao servidor | — |
| `postgres` | Base de dados: snapshots das fontes e corridas | 127.0.0.1:5432 |
| `nats` | Fila de trabalho entre a API e os workers | 127.0.0.1:4222 |

Com tudo a correr, o tempo vem em direto do IPMA e do Open-Meteo, as ocorrências do fogos.pt aparecem nos mapas e a incerteza pode correr "no servidor (200)" em vez de "no browser (30)". Se o servidor falhar a meio, a interface volta ao browser sozinha.

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

O `npm run dev` corre só a interface. Se os serviços estiverem a correr (`docker compose up -d`), encaminha `/api` para a API em http://localhost:8080. Sem eles, tudo corre no browser (corridas únicas e o ensemble de 30 corridas), sem internet nem Docker; o painel do tempo diz "sem tempo em direto" e os valores introduzem-se à mão, e "no servidor" fica desativado. Para desenvolver os serviços fora dos contentores: .NET 10 SDK e Node 24.

### Outros comandos

| Comando | O que faz |
| --- | --- |
| `npm run up` / `npm run down` | O mesmo que `docker compose up -d --build` / `docker compose down` |
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
5. **Simular**. Para ver a incerteza, liga "Incerteza" e escolhe "no browser (30)" ou, com os serviços a correr, "no servidor (200)": o painel diz em quantos cenários de vento cada decisão é melhor. As variantes de grelha também correm no servidor.

Um cenário em `web/public/scenarios/` (listado em `index.json`) abre com `http://localhost:3000/?scenario=<nome>` (ou `:5173` com `npm run dev`). Os cenários de demonstração são incêndios reais (Alijó 2019, Vieira do Minho 2016): a simulação parte da ignição e do tempo reais, e a camada "Fogo real" mostra o perímetro observado à hora da barra de tempo.

### Editor de grelha

No botão **Editor de grelha** (ou `#/grelha`):

1. Escolhe a grelha. Passa o rato sobre o mapa para ver o que a grelha diz em cada ponto: combustível, velocidade, altitude, declive, barreira, edifícios e lugar. **Ver** troca entre combustível, relevo e lugares.
2. Para experimentar alterações: **Pintar combustível** numa área (por exemplo uma faixa não ardível), **Acrescentar barreira** ou **Tirar barreiras**; muda as velocidades por combustível ou os coeficientes do modelo. A grelha oficial nunca muda: o resultado é uma variante.
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

## Aviso

O simulador é uma aproximação coerente e explicável, não uma previsão operacional.
Os coeficientes do modelo (`engine/src/params.ts`) e as velocidades por combustível são
provisórios e têm de ser calibrados contra incêndios reais.
