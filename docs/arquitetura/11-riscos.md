# 11. Riscos e dívida técnica

O que pode correr mal, como o mitigamos, e o que sabemos que está mal ou por fazer no protótipo.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Confiança dos operacionais num modelo novo | Incerteza sempre à mão; validação publicada contra incêndios reais; começar pelo planeamento e pela formação, não pelo comando em tempo real |
| Responsabilidade por más previsões | Posicionar a ferramenta como apoio à decisão; registo de auditoria; avisos claros na interface |
| Dados externos indisponíveis durante um incidente | Snapshots versionados, idade dos dados à vista, simulação sem rede |
| fogos.pt sem garantia de serviço | Só para planeamento e formação; para uso operacional, o feed oficial da ANEPC, por acordo |
| Parâmetros de combustível imprecisos | Calibração regional; CSV editável e versionado; colaboração com quem produz o FUMOD |
| Licenças de dados para uso operacional | Acordos institucionais com o IPMA, o ICNF e a ANEPC; fontes alternativas abertas (ECMWF open data) |
| Grelha errada sem aviso (uma camada falhada publicada a zeros) | Publicação que falha fechada, verificações e manifesto com hashes ([Conceitos](08-conceitos.md#grelhas-e-versões)) |
| Motor lento demais com grelhas finas | Benchmark na CI contra o portátil de referência; repartir A e B por Web Workers diferentes; Rust/WebAssembly como plano B ([Estratégia](04-estrategia.md#porque-typescript-e-quando-mudar)) |
| Hardware antigo ou VDI sem WebGL2 (o MapLibre precisa) | Levantamento do hardware no início do piloto; portátil de referência ([Implantação](07-implantacao.md#intranet)) |
| Cache apagada em perfis não persistentes ou VDI | "Importar pacote de grelhas" a partir de ficheiro; grelhas também no servidor interno ([Implantação](07-implantacao.md#funcionamento-sem-rede)) |
| Uma variante confundida com a grelha oficial, ou resultados com valores inventados apresentados como oficiais | Aviso permanente "Variante" na simulação; hash da variante no cenário e no registo; a grelha oficial nunca muda; cada entidade pode exigir grelhas oficiais nos cenários de incidentes reais ([ADR 0025](../decisoes/0025-variantes-de-grelha.md)) |
| Acesso indevido entre entidades | Uma só função de autorização com testes, ids UUID, `access_log` e teste de intrusão ([Conceitos](08-conceitos.md#identidade-e-separação-entre-entidades)) |
| Equipa pequena e muitas peças | Só quatro peças e um serviço; uma linguagem com tipos partilhados; o que não é preciso fica de fora até haver uma razão medida ([Estratégia](04-estrategia.md#o-que-fica-de-fora-e-quando-volta)) |

## Dívida técnica conhecida

Coisas do protótipo que sabemos estarem mal ou por fazer. Cada uma tem a correção prevista no [plano](../plano/caminho-para-producao.md).

| Dívida | Onde | Correção |
| --- | --- | --- |
| Se uma camada falha, a grelha é publicada com ela a zeros | `data-prep/build_grid.py` | Publicação que falha fechada (hackathon) |
| Os cenários não guardam a versão do motor, dos parâmetros nem das opções de incerteza (só as variantes guardam o hash da grelha); o motor está fixo na versão 0.1.0 | `engine/src/scenario.ts`, `engine/package.json` | Versões e hashes em cada simulação (hackathon) |
| Não há PWA nem service worker; o "sem rede" só vale com a aplicação a correr no portátil | `web/` | PWA e importação de grelhas (planeado) |
| O fundo OpenStreetMap opcional vem de `tile.openstreetmap.org` | `web/src/components/MapView.tsx` | Fonte configurável, interna (planeado) |
| Node.js 20, sem suporte desde abril de 2026 | `README.md`, `.github/workflows/ci.yml` | Node.js 22 LTS (hackathon) |
| Um só Web Worker corre A e B em sequência | `web/src/worker/sim.worker.ts` | Vários workers, quando o desempenho o pedir |
| Ids de lugar em 16 bits e grelhas dentro do git | `engine/src/types.ts`, `web/public/grids/` | Ao passar de um distrito (planeado) |
| Os coeficientes do modelo e as velocidades por combustível são provisórios | `engine/src/params.ts`, `data-prep/fuel_rates.csv` | Calibração ([Calibração e validação](../modelo/calibracao-e-validacao.md)) |
| O código não segue a configuração do Prettier do repositório: `npm run format` reformata 59 ficheiros | Raiz do repositório | Decidir entre formatar tudo de uma vez ou retirar o script |
