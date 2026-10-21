# ADR 0066: Recalibração da grelha de 100 m pela cobertura do fogo real

- Estado: aceite (o protocolo foi registado antes de pontuar qualquer modelo nos casos de 100 m reconstruídos; a calibração nova não passou a regra e a grelha de 100 m fica com os valores em uso)
- Data: 2026-10-21
- Usa a pontuação e as regras da [ADR 0065](0065-calibracao-por-cobertura-30-m.md); substitui a calibração das ADRs [0053](0053-validacao-e-calibracao-com-o-pt-firesprd.md), [0054](0054-calibracao-por-intervalo-e-por-grupo.md) e [0056](0056-fogo-de-copas.md) se passar a regra

## Contexto

- **A aplicação abre na grelha de 100 m** (`guimaraes`). É a calibração que mais se vê.
- **Os valores em uso** (`PT_CALIBRATION`: velocidade ×0,5, vento ×2,5, linhas que seguram com 5 comprimentos de chama, fogo de copas a 0,35) são os mais antigos do projeto.
  - Foram ajustados em 7 fogos com o Sørensen desde a ignição (ADR 0053), que é simétrico.
  - O motor ainda tinha as falhas que as ADRs 0058 e 0063 corrigiram, as maiores a 100 m: um fogo que começava em calmaria ficava parado (1 ha em vez de 331 ha). A calibração absorvia-as.
- **Problemas conhecidos:**
  - a largura das linhas (5) está fora de todas as estimativas (1,0 a 2,3);
  - o ×0,5 sobre todos os combustíveis também abranda o sub-bosque, cerca de 47% do que arde em Guimarães, que os ajustes por grupo põem perto de ×1;
  - o relatório no repositório não descreve o motor de hoje.
- **Fogos combatidos:** como a 30 m, o motor sem combate deve arder mais do que o fogo real onde os meios o travaram (ADR 0065).

## Protocolo (registado antes de ver resultados)

O da ADR 0065, a 100 m. Só muda o que segue.

### 1. Casos

- Os 80 incêndios do PT-FireSprd, reconstruídos a 100 m com o mesmo código da grelha de 30 m: `build_references.py --cell 100 --out out/reference --manifest out/reference/manifest.json`.
- O manifesto da CI (`engine/test/reference/manifest.json`) não muda.

### 2. Que incêndios

- A regra da ADR 0064 (`fire-selection.ts`), só com os dados, contra a grelha de 100 m de Guimarães. Ficha: `engine/reports/selection-100m.json`.
- **Ajuste:**
  - tier A;
  - pelo menos um intervalo com 5 ha novos;
  - no máximo 25% da área ardida em células que o mapa diz não arderem;
  - pelo menos 60% nos combustíveis de Guimarães.

### 3. Pontuação, objetivo, parâmetros, ajuste

Iguais aos da ADR 0065:
- **Pontuação de cobertura:**
  - Tversky com 0,2 para a área a mais e 0,8 para a área em falta;
  - a área a mais só conta acima de 3 vezes e nos intervalos livres;
  - os flancos travados ficam de fora, a 150 m;
  - a cabeça é pontuada acima de 15 m/min, com qualidade de pelo menos 3.
- **Objetivo combinado:** com λ = 1.
- **Ajuste:**
  - espaço `groupsCrown`, com o fogo de copas ligado;
  - partidas no físico e no vento ×2;
  - λ = 12, σ = 0,7, semente 1;
  - 60 gerações no ajuste principal, 40 por parte, 10 reajustes bootstrap de 20, com a regra de paragem;
  - as 5 partes e as divisões por ano e sem o Norte.

### 4. Incumbente e regra de adoção

- O incumbente é `PT_CALIBRATION`. Foi ajustado em 7 destes fogos (ADR 0053), o que o favorece.
- **A regra da ADR 0065:** nos fogos de teste das 5 partes, emparelhados, todos decidem:
  - o custo combinado desce pelo menos 0,02, com o intervalo de 90% abaixo de 0;
  - a cobertura desde a ignição não desce mais de 0,01;
  - o erro da velocidade da cabeça não sobe mais de 0,05.

  Os fogos que o incumbente nunca viu reportam-se à parte.

### 5. Hipótese e leituras

- **Combate de fundo só na calibração** (`groupsCrownSupp`): as mesmas 5 partes, pela mesma regra, contra a base.
- **Separar as alavancas** (`score-levers.ts`).
- **Mapa de cenários** (`reliability.ts --extend`) com os parâmetros finais:
  - as perturbações escolhem-se pela regra da ADR 0057;
  - o `holdSteepness` a 2, 3 e 5.

### 6. Se for adotada

- **Os valores novos:** `PT_CALIBRATION`, com as amostras do bootstrap se ganharem no Brier.
- **A grelha de 30 m fica com os valores de hoje**, copiados à parte em `PT_CALIBRATION_30M`, até à sua própria calibração (ADR 0065). O incumbente da ADR 0065 não muda.
- **A CI:** os valores registados dos 9 incêndios em `engine/test/reference.test.ts` registam-se de novo, com a razão.

### 7. Declaração

Nesta sessão nenhum modelo foi pontuado nos casos de 100 m reconstruídos. Os números de 30 m que motivaram a ADR 0065 conhecem-se, e os pesos da pontuação foram escolhidos depois de os ver (ADR 0065, ponto 8).

## Resultados

Relatório `engine/reports/pt-firesprd-2026-10-21.json` (82 min, 8 núcleos). Gráficos e tabela por incêndio em [Como calibramos](../modelo/como-calibramos.md#grelha-de-100-m-adr-0066).

### Seleção

`fire-selection.ts` escolheu a 100 m os mesmos 19 incêndios que a 30 m (`engine/reports/selection-100m.json`).

### Uma primeira corrida, refeita

- **O que falhou:** a 100 m, a zona de ignição observada de Águeda e do Sabugal é uma só célula, e essa célula é uma estrada.
  - Sem nenhuma célula que ardesse para partir, a simulação desde a ignição e o primeiro intervalo não tinham fogo, em todos os modelos.
  - A 30 m as mesmas zonas têm 5 e 11 células ardíveis.
- **Correção** (`engine/src/simulate.ts`, `startingIgnitions`): quando nenhuma das células dadas arde, o fogo parte da célula ardível mais próxima (até 200 m), como já fazia uma ignição num ponto.
  - Nenhum número dos casos de 30 m muda: o SHA-256 de `bench-calibration.ts` é o mesmo.
- **Porquê refazer:** a regra do protocolo é que cada simulação parte do fogo observado.
- **A primeira corrida** (fora do git) também não passava a regra:
  - emparelhado: custo −0,035, com 90% de −0,117 a +0,045;
  - cobertura: 0,67 contra 0,61.

### Ajuste principal: não adotado

| Fogos de teste (5 partes, 19 fogos) | Ajuste novo | Valores em uso | Modelo físico |
| --- | --- | --- | --- |
| Custo combinado (menor = melhor) | 1,551 | 1,557 | 1,743 |
| Cobertura da área ardida real, desde a ignição | 0,69 | 0,68 | 0,45 |
| Tversky desde a ignição | 0,42 | 0,50 | 0,35 |
| Sørensen desde a ignição | 0,30 | 0,41 | 0,30 |
| Erro da velocidade da cabeça (12 fogos) | 0,62 | 0,64 | 0,78 |
| Área simulada / real (mediana) | ×4,3 | ×3,9 | ×1,5 |

- **Emparelhado nos 19 fogos:**
  - custo −0,007 (90%: −0,091 a +0,081);
  - cobertura +0,009;
  - cabeça −0,026.

  É um empate, por isso **não adotar**.
- **Nos 13 que os valores em uso nunca viram:** custo −0,055 (90%: −0,149 a +0,049), cobertura +0,024.
- **Melhor ajuste e intervalos de 90% do bootstrap:**

  | Fator | Melhor ajuste | Intervalo de 90% | Em uso |
  | --- | --- | --- | --- |
  | Sub-bosque | 1,91 | 0,66–2,48 | 0,5 |
  | Matos | 0,73 | 0,54–1,20 | 0,5 |
  | Herbáceas | 0,57 | 0,41–0,98 | 0,5 |
  | Vento a meia chama | 2,31 | 1,58–3,16 | 2,5 |
  | Largura que segura (× chama) | 2,30 | 0,78–4,08 | 5 |
  | Fogo de copas | 0,47 | 0,47–0,98 | 0,35 |

- **As duas partidas acabam no mesmo sítio:** custo 1,4432 a partir do físico e 1,4425 a partir do vento ×2.
- **Brier (20 realizações, só lido):**
  - só o melhor 0,075, com as amostras 0,069, valores em uso 0,053;
  - o Brier é simétrico, e castiga a área a mais que o motor sem combate deve ter.

### Hipótese: combate de fundo

- **Contra a base, nos mesmos 19 fogos:** custo −0,004 (90%: −0,018 a +0,010), cobertura −0,002.
- É um empate, por isso fica a base.

### Que alavanca conta

O melhor ajuste, com um fator de cada vez no valor físico, nos 19 fogos (`score-levers.ts`, dentro da amostra):

| No valor físico | Custo combinado | Cobertura |
| --- | --- | --- |
| Vento (2,31 → 1) | +0,42 | −0,30 |
| Largura das linhas (2,30 → 1) | +0,13 | −0,19 |
| Fogo de copas (0,47 → 1) | +0,02 | +0,01 |

### Leitura

- **Os valores em uso já cobrem os incêndios reais** tão bem como um ajuste novo. Os dois ganham com folga ao modelo físico (0,68 contra 0,45).
- **O vento a meia chama forte é o que mais pesa:** cerca de ×2,3 a ×2,5. O ERA5 subestima o vento local.
- **O ajuste novo discorda dos valores em uso em dois pontos:**
  - sub-bosque mais rápido (1,9 contra 0,5);
  - linhas que cedem mais cedo (2,3 contra 5 comprimentos de chama).

  Com 19 incêndios, os intervalos são largos e a diferença não se distingue do ruído.
- **Combate:** mais de metade da área a mais dos intervalos fica para lá de flancos travados (53% no ajuste, 61% nos valores em uso). É coerente com o combate como explicação.

### O que muda

- **Nada na aplicação:** `PT_CALIBRATION` fica.
- **A grelha de 30 m** continua com os mesmos valores, e o incumbente da ADR 0065 não muda.
- **O mapa de cenários** não se refaz, porque os valores não mudaram (relatório `reliability-2026-10-19.json`).
- **A CI:**
  - `calibration.test.ts` lê este relatório;
  - os 9 incêndios de `reference.test.ts` ficam como estavam;
  - um teste novo guarda a correção das ignições (`coverage-objective.test.ts`).
