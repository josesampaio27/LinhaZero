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

**Regras da página**

- **Só escuro.** Fundo `#111615`, painel `#192120`, campo fundo `#0b100f`, tinta `#e5ebe8`, `color-scheme: dark`, `theme-color` único. Sem tema claro, sem `prefers-color-scheme`, sem botão de tema. Teal (`#0b7782`) e violeta (`#6447d1`) só onde há uma decisão A e uma B; a rampa do fogo só no mapa.
- **Uma secção, um ecrã.** Cada secção cabe inteira numa janela, sem cortes nem scroll dentro dela, a 1440×900, 1366×768, 1920×1080, 768×1024 e 390×844. Os tamanhos de letra e os espaços dependem também da altura (`min(vw, svh)`). `.screen` (altura de um ecrã, para secções com foto ou campo de cor) e `.fit` (só a altura do conteúdo). Onde o telemóvel não tem espaço, sai a foto ou o painel dessa secção em vez de se cortar texto. Verificação: `npx tsx landing/scripts/fit-check.ts` com o preview a correr; mede cada secção às cinco medidas e falha se uma passar a altura da janela ou se algum texto, célula, campo ou botão sair dela.
- **Por portugueses, para Portugal, dito sem slogans nem bandeiras.** A frase do herói termina em "Feito em Guimarães, com dados e incêndios de Portugal"; a validação chama-se "Testado em 80 incêndios portugueses"; os dados abrem com "Fontes portuguesas e europeias sobre Portugal"; "Para quem decide" começa por "Feito em Guimarães, por quem conhece os incêndios do país"; o rodapé diz "Por portugueses, para Portugal." (uma vez só). Todas as imagens são de Portugal.
- **Slogan.** "Simular, comparar e aperfeiçoar." é o título do campo teal de "Pedir acesso", o fecho da página, onde a frase faz sentido como convite e não compete com o título do herói.
- **Ação principal: "Cenário de demonstração"**, o mesmo nome no herói, no fecho e no rodapé, ligado a `DEMO_URL` (por omissão `${APP_URL}?demo`, com `VITE_DEMO_URL`). O cenário de demonstração abre sem login, só de leitura: abre o primeiro exemplo e simula-o; os exemplos podem ser simulados mas não alterados ([ADR 0080](../decisoes/0080-demonstracao-so-de-leitura.md)). "Entrar" (`/entrar`) e "Pedir acesso" (`/pedir-acesso`) ficam na barra.
- **Sem promessas de funcionar sem rede.** É uma aplicação web.

**Secções**

- **Herói:** banda do título por cima e mapa a toda a largura com a altura que sobra (55 a 63 % do ecrã no computador). Título "O mesmo fogo, / duas decisões" com "fogo" na rampa do fogo do mapa (só a ponta clara, amarelo a laranja, 4,5:1 ou mais) e "decisões" nas tintas das decisões (teal a violeta), a pedido do utilizador. O utilizador escolheu a versão animada, que é agora a única (o interruptor `?fogo` saiu): tremor de calor em "fogo" e ondulação em "decisões", por filtro SVG de baixa frequência (cerca de 1 px, 2 e 1,6 de escala), numa só passagem de 4 s, de 1,1 s a 5,1 s depois de carregar (depois de o título subir e o divisor varrer). A deformação entra, mantém-se e volta a 0, por isso as palavras param exatamente como desenhadas; nada se mexe mais de 5 s (WCAG 2.2.2) e, com movimento reduzido, as palavras ficam paradas desde o início. O mapa vem primeiro como dois cartazes inteiros, `hero-a.webp` e `hero-b.webp` (1600 × 1000, de `/?poster` a 800 × 500, 2×, com versões de 800 e 1200 px feitas por `to-webp.ts` em `srcset`, e pré-carregados no `index.html`), com B recortado no divisor em CSS (o recorte fica num invólucro, para que o zoom de 1,5× no telemóvel, centrado na cabeça do fogo, não o desloque), por isso o divisor arrasta-se também no telemóvel e com as setas. Ao carregar, o divisor varre de quase tudo A até 70 %, sobre a cabeça do fogo onde A e B diferem, em cerca de um segundo (sem varrimento com movimento reduzido). Os títulos "Decisão A"/"Decisão B" (os `.map-title` da aplicação) acompanham o divisor, um de cada lado; a pastilha "Arraste para comparar" some ao primeiro gesto. No computador, o MapLibre substitui os cartazes quando o browser fica livre e segue o rato em toda a janela. `hero.webp` (900 px) é só o mapa pequeno do painel.
- **Como funciona:** os cinco passos numa lista ao lado do painel do cenário da aplicação, que mostra a comparação final; passar o rato ou carregar num passo mostra o painel nesse passo. No telemóvel fica só a lista.
- **A resposta, por palavras:** as quatro frases-modelo da comparação, no estilo `.headline` da aplicação, com os valores por preencher (`X`, `aldeia`, `hh:mm`, `N`, `mm`), nunca números reais; no computador, ao lado, Monchique dias depois do incêndio de agosto de 2018. Não há vídeo: nas coleções abertas não existe filmagem honesta de um incêndio português, e material estrangeiro não entra.
- **Satélite:** Portugal a 18 de junho de 2017 (MODIS, NASA), num ecrã próprio.
- **Validação:** "Testado em 80 incêndios portugueses", a tabela de Sørensen (0,25 / 0,34 / 0,38), "ganha em 28 dos 34", a regra de honestidade e um retângulo no lugar do gráfico, que vai mudar.
- **Dados:** as seis fontes numa lista curta, ao lado de Guimarães vista da Penha e de um caminho na Penha (fotos fora no telemóvel).
- **Para quem decide:** as seis entidades da proposta, cada uma com o seu "para quê" numa linha.
- **Quem somos** (entre "Para quem decide" e "Pedir acesso": depois de dizer para quem é, diz quem o faz, mesmo antes de pedir confiança): os dois developers, por ordem alfabética, José Sampaio (Senior Software Engineer) e Rodrigo Vicente (Mid Software Engineer & DevOps), com os cargos tal como o utilizador os escreveu, em inglês (`lang="en"`). Dois retratos 4:5 lado a lado em todas as medidas, com nome e cargo por baixo, no campo fundo. Os retratos estão em `landing/public/team/jose-sampaio.webp` e `rodrigo.webp` (fotografias reais, recortadas a 4:5 em WebP); para trocar um, basta substituir o ficheiro. Os dados estão no array `TEAM` de `landing/src/pages/Home.tsx`. Sem biografias nem ligações. Está também na barra.
- **Pedir acesso:** o slogan, uma frase, e o diálogo da aplicação (entidade e tipo) que leva a `/pedir-acesso?entidade=…&tipo=…`.
- **Rodapé:** sóbrio, nas margens da página: logótipo e nome em tamanho normal, "Por portugueses, para Portugal.", as três ações, a documentação, o código e os créditos das imagens.

**Texturas** (outubro de 2026): vêm dos dados do próprio projeto, nunca de decoração. Uma linguagem só, linhas finas de espessura única ou pontos, num tom, com pouco contraste, uma camada própria por secção (`.tex` e um `::before` com `background-image`, sem JS, sem gradientes, sem animação). Geradas por `landing/scripts/hero-fire.ts` (que já faz o fogo do herói) para `landing/public/textures/`:

| Ficheiro | Dados | Onde | gzip |
| --- | --- | --- | --- |
| `guimaraes-relevo.svg` | o relevo de toda a grelha de 50 em 50 m (anéis pequenos retirados) | "A resposta", de ponta a ponta, a 0,11, com máscara que o apaga sob o título e a introdução | 30 KB |
| `isocronas.svg` | o fogo do herói com a decisão A, linhas de chegada de hora a hora | "A resposta", destaque em baixo à direita, a 0,14 | 4 KB |
| `penha-relevo.svg` | o relevo da Penha de 50 em 50 m, à volta do cume (602 m), em tinta escura | campo teal de "Pedir acesso", a 0,2 | 6 KB |
| `edificios.svg` | as células de 100 m com quatro edifícios ou mais, um ponto cada | rodapé, a 0,12 (fora no telemóvel) | 3 KB |

As outras secções ficam lisas, para as texturadas se lerem. O texto mantém 4,5:1 com folga (cerca de 12:1 para a tinta e 6,5:1 para o cinzento sobre as linhas): as linhas claras ficam a 11 a 14 % sobre o fundo escuro, e as do teal são escuras, o que só aumenta o contraste do texto branco. O antigo `hero/contours.svg`, que não era usado, foi retirado.

**Imagens** (em `landing/public/photos`, créditos em `credits.json` e no rodapé; WebP feitos com `landing/scripts/to-webp.ts`): NASA MODIS, Portugal a 18 de junho de 2017 (domínio público); Halley Oliveira, Guimarães vista da Penha (CC BY-SA 2.0); Manuel_Rocha, caminho na Penha (CC BY-SA 3.0); Bextrel, Incêndio de Monchique 2018 (CC BY-SA 4.0).

**Peso:** JS principal ~56 KB gz, CSS ~9 KB gz; o MapLibre continua num chunk à parte, só no computador, depois de `load` e de o browser ficar livre.

**Revisão impeccable (outubro de 2026).** Crítica e auditoria com a skill impeccable (modo Persuade, duas avaliações isoladas, detetor). Mudanças:

- **Herói:** zoom de 1,5× no telemóvel sobre a cabeça do fogo (antes o fogo era uma mancha de 60 px), pastilha "Arraste para comparar" em cima no telemóvel, fora do fogo; divisor com Home/End e setas para cima e para baixo, `aria-valuemin`/`max` iguais ao limite real (6 a 94); cartazes com `srcset` e pré-carregamento.
- **Acessibilidade:** ligação "Saltar para o conteúdo"; anel de foco branco no campo teal (o teal sobre teal ficava a 2,2:1); ligações da barra e do rodapé com alvos de 44 ou 24 px; entrelinha das frases a 1,3; barra de scroll, cursor de texto e `accent-color` da paleta.
- **Como funciona:** no telemóvel, onde o painel não aparece, os passos são uma lista simples, não botões que não fazem nada. O passo ativo leva a barra em tinta, não em teal (o teal é só da decisão A).
- **Frases:** um só cenário coerente, em que ganha B (como no mapa do herói, onde B arde menos), com o aviso sobre a linha de A; "variações do vento" em todo o lado (o painel dizia "cenários").
- **Validação:** a legenda liga 80 a 34 ("Dos 80, só os 34 de 2018 a 2021 têm o combustível do próprio ano") e diz porque nem um motor perfeito chegaria a 1 (os fogos reais foram combatidos); colunas "Modelo simples / Sem calibrar / LinhaZero"; linhas "8 no Norte" e "26 de teste"; "Ver incêndio a incêndio" também no telemóvel.
- **Pedir acesso:** o campo Entidade vem vazio (com exemplo) e é obrigatório; tipos Bombeiros, Proteção civil, Câmara, GNR, INEM e Outra; "Cenário de demonstração" também no telemóvel.
- **Logótipo:** `logo-outline.png` (3×, contorno branco de ~1,3 px a seguir a silhueta, feito em canvas), na barra e no rodapé; o favicon não mudou.
- **Texto:** "que se podem ajustar"; sem vírgula antes de "e" em "Para quem decide".

Os avisos que ficam no detetor são decisões do utilizador: o texto em gradiente de "fogo" e "decisões", e as barras de 5 px dos títulos dos mapas e das frases (o estilo da aplicação).


## 9. As páginas do motor e da calibração (outubro de 2026)

O repositório é privado, por isso a landing deixou de ligar para o GitHub e explica-se a si própria.

- **Três páginas,** escolhidas pelo caminho em `landing/src/App.tsx`:
  - `/`: a página principal, uma secção por ecrã como antes;
  - `/motor`: "Como funciona o motor";
  - `/calibracao`: "Calibração e validação".

  O nginx e o Vite já mandam qualquer caminho para o `index.html`. As subpáginas leem-se como um artigo (`components/Article.tsx`): título, índice fixo ao lado do texto no computador, secções, caixas "Para especialistas" com os termos exatos, referências e "A seguir".
- **Barra e rodapé partilhados** (`components/Nav.tsx`, `components/Footer.tsx`).
  - **Barra:** Como funciona, O motor, Calibração, Dados, Quem somos. As secções da página principal escrevem-se `/#id`, para funcionarem também nas subpáginas.
  - **Rodapé:** a coluna "Documentação" liga às duas páginas. A proposta ao desafio e o "Código aberto" saíram.
- **Números de um só script:** `engine/scripts/landing-data.ts` escreve `landing/src/data/site-data.json` (data e versão do código lá dentro). Volta a correr-se quando a calibração mudar; nenhuma página tem números escritos à mão. O script reúne:
  - a validação desde a ignição com o motor de hoje: 34 incêndios, Norte, fora do ajuste, e o controlo com o vento invertido;
  - os resultados da recalibração de 100 m (ADR 0069), com as alavancas;
  - o mapa de cenários em uso;
  - a composição da grelha.
- **Validação na página principal:**
  - a tabela tem os números novos (0,27 / 0,33 / 0,40; "27 destes 34");
  - o retângulo provisório deu lugar a uma barra por incêndio, com quanto o LinhaZero ganha ao modelo simples. As 27 barras azuis acima da linha são os "27 destes 34" da frase ao lado, e as 7 laranja abaixo os casos em que perde. O gráfico fica escondido no telemóvel;
  - uma linha diz a cobertura nos 19 incêndios de teste (calibrado 68%, sem calibrar 45%);
  - duas ligações, para as páginas do motor e da calibração.
- **Gráficos** (`components/charts`): SVG em React, à largura real para que o texto fique no seu tamanho.
  - **Cores:** azul `#3987e5`, laranja `#d95926` e verde-água `#199e70`, validados no fundo `#111615`. O teal e o violeta ficam para as decisões A e B.
  - **Leitura:** forma própria por série, legenda, dica ao passar o rato e "Ver os números" com a tabela.
  - **No telemóvel:** os nomes longos encurtam.
- **Diagramas** (`components/diagrams`): as camadas de uma célula, as 32 direções e a elipse, um intervalo pontuado (acerto, falta, a mais, flanco travado) e o peso de um hectare. No telemóvel, os mais largos deslizam dentro da figura, nunca a página.
- **Mapas:** `landing/scripts/figures.ts` desenha, uma célula por pixel, as camadas de Guimarães e o incêndio de Alijó sem calibrar e calibrado. Escreve PNG com um codificador mínimo sobre `node:zlib`, e a página amplia-os sem suavizar.
- **Verificação:**
  - `landing/scripts/fit-check.ts` ignora o que está fechado num `<details>`;
  - verifica também que `/motor` e `/calibracao` não deslizam para o lado a 1440 e a 390 px.
