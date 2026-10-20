# Landing page: plano de desenho e construção

Uma segunda aplicação web (React + Vite + shadcn/ui) que apresenta o LinhaZero a quem ainda não o usa e leva a pedir acesso ou entrar. A autenticação vem logo a seguir; aqui só se desenha a página e se deixam os botões no sítio.

## 1. Brief

- **O que é:** simulador que compara duas decisões de combate a um incêndio rural e diz, em português claro e com a incerteza à vista, qual protege mais.
- **Para quem:** quem comanda nos primeiros minutos (bombeiros, proteção civil municipal, câmara, GNR) e quem avalia a ferramenta (júri do Hack4Guimarães 2035, entidades).
- **Trabalho da página:** fazer perceber em dez segundos o que a ferramenta responde, mostrar que é credível (80 incêndios reais) e levar a "Pedir acesso" ou "Experimentar".
- **Língua:** português de Portugal, como a aplicação. Sem anglicismos nos botões.

## 2. Direção visual

A identidade já existe na aplicação (Barlow, teal da decisão A, violeta da decisão B, verdes-cinza de fundo, rampa amarelo → vermelho só para o fogo). A landing herda-a: quem clica em "Experimentar" não pode sentir que mudou de produto. A escolha é continuidade, não omissão.

**Cor** (os mesmos tokens de `web/src/styles.css`, mapeados para as variáveis do shadcn). **A landing é só escura:** os valores da coluna "Escuro" são os únicos tokens, em `:root`, com `color-scheme: dark`; não há tema claro, nem `prefers-color-scheme`, nem botão de tema. A coluna "Claro" fica como referência da aplicação.

| Token | Claro | Escuro | Papel |
| --- | --- | --- | --- |
| `--bg` | `#f4f6f4` | `#111615` | fundo da página |
| `--ink` | `#18211f` | `#e5ebe8` | texto, botão primário |
| `--muted` | `#5a6662` | `#98a5a0` | texto secundário |
| `--a` | `#0b7782` | `#3db6c1` | decisão A, foco, ligações |
| `--b` | `#6447d1` | `#a08cf5` | decisão B |
| fogo | `#f3d13a → #c0282b` | igual | só o fogo no mapa |

Teal e violeta nunca são decoração: aparecem só onde há uma decisão A e uma decisão B (mapa do herói, frases de comparação). O resto é tinta e fundo.

**Tipo:** Barlow Condensed 700 para títulos (alto, apertado, de sinalética), Barlow 400/500 para o corpo. Só três ficheiros woff2 (os da aplicação), servidos localmente. Escala: 1.25 (16, 20, 25, 31, 39, 49, 61 px); título do herói a `clamp(2.4rem, 6vw, 4.6rem)`, entrelinha 0.95. Corpo a 18 px, 1.55, largura máxima 65 caracteres.

**Disposição:** tudo alinhado à esquerda, uma coluna de conteúdo de 1120 px no máximo, com margem de 16 px no telemóvel. Sem cartões iguais em grelha: as secções distinguem-se por espaço e por uma régua de 1 px, não por caixas.

```
┌──────────────────────────────────────────────────────────────┐
│ ◆ LinhaZero   Como funciona  O motor  Validação     Entrar [Pedir acesso] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Se eu tomar a decisão A        ╭────────────────────────╮  │
│  ou a decisão B, o que          │  relevo 3D de Guimarães │  │
│  acontece ao fogo nas           │  inclinado, roda com o  │  │
│  próximas horas?                │  rato; dois perímetros  │  │
│                                 │  (A teal, B violeta)    │  │
│  Dois mapas lado a lado, …      │  sobre o mesmo fogo     │  │
│  [Experimentar com Guimarães]   ╰────────────────────────╯  │
│   Ver como funciona                                          │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Como funciona (1→5, passos reais)        | captura da app   │
├──────────────────────────────────────────────────────────────┤
│  "A decisão B protege 163 edifícios…"  (as frases que a      │
│   aplicação escreve, em tipo grande, A/B a cor)              │
├──────────────────────────────────────────────────────────────┤
│  Validado em 80 incêndios reais   | gráfico validacao-tier-a │
├──────────────────────────────────────────────────────────────┤
│  Feito para Portugal: FUMOD, Copernicus, IPMA, OSM, Censos   │
├──────────────────────────────────────────────────────────────┤
│  Para quem  (bombeiros · proteção civil · câmara · GNR)      │
├──────────────────────────────────────────────────────────────┤
│  Pedir acesso / Entrar       rodapé: Hack4Guimarães, UMinho  │
└──────────────────────────────────────────────────────────────┘
```

No telemóvel o mapa do herói passa para baixo do título, em imagem estática.

**Princípios**

- A ousadia gasta-se num sítio: o relevo do herói. Tudo o resto é quieto.
- O conteúdo é o produto a falar: as frases de comparação da própria aplicação são o elemento gráfico da segunda secção, não ilustrações.
- Números só onde mudam a decisão de quem lê: na secção da validação.
- Movimento: um só momento orquestrado (o relevo aparece e inclina-se para o ponteiro). Nenhuma animação ao fazer scroll, nenhum hover a flutuar cartões.
- Honestidade: a página diz que o motor simula sem combate e que a validação fica abaixo de 1 porque os fogos reais foram combatidos. É a voz do projeto.

## 3. Revisão contra o genérico

Antes de construir, o plano foi comparado com o que sairia para "landing page de uma startup de software":

- Fundo creme com serifa e laranja-terracota: não. Verdes-cinza e Barlow, herdados da aplicação.
- Preto com um acento ácido: não.
- Grelha de cartões iguais com a mesma sombra: trocada por secções separadas por espaço e régua; a única grelha é a lista de fontes de dados, que é mesmo uma lista.
- Marcadores numerados: só em "Como funciona", que é uma sequência real de cinco passos no ecrã.
- Etiquetas em maiúsculas, pontos a meio, setas nos botões: nenhum.
- Número grande com etiqueta pequena no herói: não. O herói é a pergunta do produto e o relevo.
- Alterado em revisão: a primeira versão tinha uma secção "Porque é diferente" em tabela de comparação com outros simuladores. Ficou de fora: é conteúdo de proposta, não de landing; a tabela está na documentação e a página liga para lá.

## 4. O mapa 3D no herói: custo e decisão

A aplicação mostra o relevo com MapLibre GL: um protocolo `griddem://` gera tiles Terrarium a partir de `elevation.f32` (`web/src/lib/dem-tile.ts`), `renderTerrain` pinta combustíveis com hillshade (`web/src/lib/render.ts`) e `map.setTerrain` inclina a câmara. Reutilizar isto é possível; a questão é o peso.

| Opção | Peso extra | Primeira pintura | Sensação |
| --- | --- | --- | --- |
| A. MapLibre no herói, carregado com a página | ~320 KB gz de JS + 72 KB CSS + ~220 KB de grelha + ~150 ms de CPU para tiles e hillshade | atrasa 1 a 2 s | 3D real, roda e inclina com o rato |
| B. Imagem estática (WebP) com `perspective` + `rotateX/rotateZ` em CSS a seguir ao rato | ~100 KB | nenhuma | inclina mas é plano: nota-se |
| **C. Imagem estática primeiro, MapLibre depois (recomendada)** | igual a B para a primeira pintura; o MapLibre vem num chunk separado, após `load` + `requestIdleCallback`, só com `pointer: fine` e sem `prefers-reduced-motion` | nenhuma | 3D real 1 a 2 s depois, com fade sobre a imagem; telemóvel fica com a imagem |

**Decisão: C.** A página carrega como qualquer landing leve (orçamento abaixo) e o relevo real aparece quando o browser está livre. Se o chunk falhar ou demorar, a imagem já lá está e ninguém nota. No telemóvel não há rato para seguir, por isso o MapLibre nunca é descarregado.

Como se segue o rato: um `pointermove` no herói guarda o alvo (`bearing` = −25° a +25° conforme o x, `pitch` = 50° a 65° conforme o y); um ciclo `requestAnimationFrame` aproxima a câmara ao alvo com `jumpTo` e interpolação a 8% por frame. Sem `easeTo` em cada evento (encadeia animações). Zoom, arrastar e scroll do mapa desativados: o herói não é um mapa, é uma cena.

O que se mostra no relevo: os azulejos do OpenStreetMap (como a opção "OSM" da aplicação) sobre o relevo da grelha `guimaraes` (100 m, 157 × 152 células) com exagero 3, e um fogo sem combate gerado uma vez com o motor (`landing/scripts/hero-fire.ts` escreve `landing/public/hero/fire.json`), com as células coloridas pela hora de chegada. A câmara olha para o centro de Guimarães; o fogo vem de nordeste da Penha. As duas decisões não se desenham no mapa (experimentou-se e confundia): só entram nas frases da secção da comparação, que o mesmo script calcula. A imagem estática (`hero.webp`, 1600 × 1000, cerca de 220 KB) é uma captura do próprio HeroMap na pose inicial, tirada com `landing/scripts/hero-poster.ts` (Chrome sem janela, protocolo DevTools) e versionada. A textura sintética por combustíveis foi experimentada e rejeitada: a 100 m fica em blocos e disputa a atenção ao fogo.

Orçamento de desempenho da primeira pintura: ≤ 150 KB gz de JS e CSS (React 45, Radix do shadcn ~25, Tailwind ~10, resto da página), 3 fontes (~60 KB), imagem do herói ≤ 120 KB. Lighthouse móvel ≥ 90 em desempenho e 100 em acessibilidade.

## 5. Estrutura no repositório

- Novo workspace `landing/` (Vite + React + TypeScript, Tailwind v4 via `@tailwindcss/vite`, shadcn/ui com `components.json`). Entra em `workspaces` da raiz; scripts `dev:landing`, `build:landing`; `npm run typecheck` passa a cobri-lo; em `eslint.config.js`, `landing/public/**` entra nos ignorados e a regra do `react-hooks` passa a `{web,landing}/**/*.{ts,tsx}`.
- Dependências: `react`, `react-dom`, `tailwindcss`, `@tailwindcss/vite`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge` (as que o shadcn pede). Para o chunk do herói: `maplibre-gl`, `proj4`, `@linha-zero/engine` (já no monorepo; o `npm install` partilha-os).
- Código partilhado com a aplicação: `demTilePixels`, `renderTerrain`, `gridCorners` e `fetchGrid` importados por alias (`@web/*` → `../web/src/*`) em `vite.config.ts` e `tsconfig.json`. Sem mover ficheiros nem criar pacote novo: a landing é o segundo consumidor; se aparecer um terceiro, aí sim se extrai `@linha-zero/map`.
- Grelha: `landing/public/grids/guimaraes/` é uma ligação ou cópia de `web/public/grids/guimaraes/` (só os ficheiros que `renderTerrain` lê: header, elevation, fuel, barrier, buildings; ~200 KB).
- Fontes: os três woff2 copiados de `web/src/fonts/` com a licença OFL.
- Componentes shadcn a adicionar: `button`, `sheet` (menu no telemóvel), `separator`. Mais nenhum até ser preciso.
- Para refazer o fogo ou a imagem do herói: `npx tsx landing/scripts/hero-fire.ts`; depois `npm run build:landing`, `npm run preview -w landing -- --port 4173` e `npx tsx landing/scripts/hero-poster.ts`.
- Botões "Entrar" e "Pedir acesso": `<a href="/entrar">` e `<a href="/pedir-acesso">`. Sem router por agora; quando a autenticação chegar, decide-se o router e os caminhos.
- Fora deste trabalho: contentor e rota no nginx (hoje a aplicação está em `/`; a landing vai obrigar a escolher `/` para a landing e `/app/` para a aplicação, ou domínios distintos). Fica anotado para a fase da autenticação, porque a decisão depende de onde fica o login.

## 6. Conteúdo por secção (texto real, de `docs/proposta-desafio.md` e `docs/modelo/`)

1. **Barra:** logótipo + LinhaZero; Como funciona, O motor, Validação; Entrar; Pedir acesso. Fixa, fundo translúcido com `backdrop-filter`. Telemóvel: `Sheet`.
2. **Herói:** título "Se eu tomar a decisão A ou a decisão B, o que acontece ao fogo nas próximas horas?"; parágrafo "Em menos de um minuto, dois mapas lado a lado mostram o fogo a avançar hora a hora em cada decisão, quantos edifícios e pessoas cada uma protege e em quantas variações do vento uma é melhor do que a outra."; botões "Experimentar com Guimarães" (abre a aplicação) e "Ver como funciona" (âncora).
3. **Como funciona:** os cinco passos da proposta (marcar a ignição; o tempo vem preenchido do IPMA; desenhar duas decisões; dois mapas sincronizados; comparação em linguagem simples). Ao lado, uma captura da aplicação com os dois mapas.
4. **A comparação, por palavras:** três frases reais em tipo grande, com "A" e "B" a cor: "A decisão B protege 163 edifícios e cerca de 400 pessoas em Souto do Monte.", "Com a decisão A, o fogo chega à aldeia às 2h04; com a B, não chega nas próximas 4 horas.", "Em 27 de 30 variações do vento, B é melhor do que A." Nota em pequeno: valores ilustrativos.
5. **Validado em incêndios reais:** 80 incêndios do PT-FireSprd; sobreposição 0,38 contra 0,25 do modelo simples; melhor em 28 de 34; a regra de honestidade (só entra o que melhora em fogos que não serviram para ajustar). Gráfico `validacao-tier-a.png`. Ligação para `docs/modelo/validacao-resumo.md`.
6. **Feito para Portugal:** FUMOD, relevo Copernicus, coberto arbóreo Copernicus, IPMA e Open-Meteo, OpenStreetMap, ocorrências do fogos.pt. Lista simples com uma linha sobre o que cada fonte dá.
7. **Para quem:** comandante no terreno, serviço municipal de proteção civil, câmara, GNR: a mesma imagem para todos. Duas colunas de texto, sem cartões.
8. **Fecho e rodapé:** "Pedir acesso" e "Entrar" repetidos; Hack4Guimarães 2035, Universidade do Minho, Laboratório da Paisagem; ligações para a documentação e o repositório.

## 7. Ordem de construção

1. Workspace `landing/`, Tailwind, shadcn init, tokens e fontes; `npm run dev:landing` abre uma página vazia com o tipo certo.
2. Barra de navegação com `Sheet` no telemóvel.
3. Herói com texto, botões e um retângulo cinzento no lugar do mapa.
4. `HeroMap` em chunk separado: protocolo `griddem`, textura, terreno, perímetros A/B, seguir o rato, condições de carregamento. Captura para `hero.webp`.
5. Secções 3 a 8 com o texto acima.
6. Só modo escuro (ver secção 8), foco visível, `prefers-reduced-motion`, telemóvel a 360 px.
7. Scripts na raiz, uma linha no README, Lighthouse.

Verificação ao fim: `npm run typecheck`, `npm run lint`, `npm run build:landing`, Lighthouse móvel ≥ 90, e a página sem o chunk do MapLibre (Network bloqueado) tem de ficar igual na primeira pintura.

## 8. Redesenho (outubro de 2026): o que está construído

A primeira versão lia-se genérica ("feita por IA"). O redesenho seguiu as skills frontend-design e taste-skill (direção "Loud and flat", com a paleta e o tipo da marca mantidos) e esta ideia: **o próprio resultado da aplicação é o material da página**, o mapa dividido, o painel do cenário e as frases que a aplicação escreve.

- **Só escuro.** Fundo `#111615`, painel `#192120`, campo fundo `#0b100f`, tinta `#e5ebe8`. Teal e violeta só onde há uma decisão A e uma B; a rampa do fogo só no mapa. O mapa (azulejos claros do OSM), o cartaz e os fragmentos `data-ui` leem-se sobre o escuro como fotografias. `theme-color` único `#111615`.
- **Feito em Portugal, para Portugal, dito sem slogans.** A frase do herói termina em "Feito em Guimarães, com os dados e os incêndios de Portugal"; a validação chama-se "Testado em 80 incêndios portugueses"; os dados abrem com "Fontes portuguesas e europeias sobre Portugal"; "Para quem decide" começa por "Feito em Guimarães, para o Hack4Guimarães 2035, a pensar na proteção civil portuguesa". Sem bandeiras, selos nem etiquetas. Todas as imagens são de Portugal.
- **Sem promessas de funcionar sem rede.** É uma aplicação web; a página não fala de rede, internet ou modo offline.
- **Herói:** título "O mesmo fogo, / duas decisões" (Barlow Condensed, duas linhas em todas as larguras), frase e botão "Experimentar com Guimarães" à direita, e por baixo o mapa 3D a toda a largura em 12:5, com o divisor arrastável (A à esquerda, linha de contenção; B à direita, ataque direto), os títulos "Decisão A"/"Decisão B" iguais aos `.map-title` da aplicação e a legenda das horas. A câmara segue o rato em toda a janela. Barra: logótipo, quatro âncoras, "Entrar" (`/entrar`) e "Pedir acesso" (`/pedir-acesso`).
- **Cartaz:** `hero.webp` 1920 × 800, capturado de `/?poster` a 960 × 400 com 2× (`landing/scripts/hero-poster.ts`). O divisor começa a 62 %.
- **Como funciona:** os cinco passos numa `<ol>` à direita; à esquerda, fixo, o painel do cenário da aplicação avança com o passo que está no meio do ecrã (ignição, tempo, decisões, mapas, comparação). No telemóvel o painel vem no fim, já completo.
- **A resposta, por palavras:** as quatro frases-modelo da comparação, no estilo `.headline` da aplicação, com os valores como espaços por preencher (`X`, `aldeia`, `h:mm`, `N`, `mm`), nunca números reais; ao lado, Monchique dias depois do incêndio de agosto de 2018 (casas de pé, encosta ardida). Não há vídeo: nas coleções abertas não existe filmagem honesta de um incêndio português, e material estrangeiro não entra.
- **Validação:** "Testado em 80 incêndios portugueses"; a imagem de satélite de 18 de junho de 2017 a toda a largura, a tabela de Sørensen (0,25 / 0,34 / 0,38) e um retângulo no lugar do gráfico, que vai mudar.
- **Dados:** as seis fontes numa lista, ao lado de Guimarães vista da Penha e de um caminho na Penha.
- **Para quem decide:** as seis entidades da proposta, cada uma com o seu "para quê".
- **Pedir acesso:** campo teal com o diálogo da aplicação (entidade e tipo), que leva a `/pedir-acesso?entidade=…&tipo=…`.
- **Rodapé:** o nome a toda a largura, ligações, documentação e os créditos das imagens.
- **Imagens** (em `landing/public/photos`, créditos em `credits.json` e no rodapé): NASA MODIS, Portugal a 18 de junho de 2017 (domínio público); Halley Oliveira, Guimarães vista da Penha (CC BY-SA 2.0); Manuel_Rocha, caminho na Penha (CC BY-SA 3.0); Bextrel, Incêndio de Monchique 2018 (CC BY-SA 4.0). Convertidas para WebP com `landing/scripts/to-webp.ts`.
- **Peso:** JS principal ~55 KB gz, CSS ~8 KB gz; o MapLibre continua num chunk à parte, só no computador, depois de `load` e de o browser ficar livre.
