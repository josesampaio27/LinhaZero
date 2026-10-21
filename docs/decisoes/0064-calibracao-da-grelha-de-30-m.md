# ADR 0064: Calibração da grelha de 30 m

- Estado: aceite (o protocolo foi registado antes de pontuar qualquer modelo nos casos de 30 m; os resultados estão no fim, com um desvio declarado: a grelha de 30 m fica com os valores da de 100 m)
- Data: 2026-10-20
- Depende da [ADR 0063](0063-tempo-que-muda-cantos-e-estado-de-partida.md) (motor corrigido). Não muda a calibração da grelha de 100 m.

## Contexto

A grelha `guimaraes-30m` usava a calibração da grelha de 100 m (`PT_CALIBRATION`). Esta foi ajustada a 100 m, com um motor que entretanto mudou (ADRs 0058 e 0063), e absorve efeitos próprios dessa resolução:

- estradas como faixas de 100 m sem combustível;
- um caminho do fogo menos flexível em combustíveis misturados;
- recomeços que perdiam meia célula.

Decisão de partida: **a grelha de 30 m calibra-se à parte, como se a de 100 m não existisse**. A partir dos valores físicos, nos mesmos incêndios reconstruídos a 30 m, e com o fogo de cada simulação a partir do estado observado.

## Protocolo (registado antes de ver resultados)

### 1. Casos

- Os 80 incêndios do PT-FireSprd, construídos a 30 m com o mesmo código da grelha de Guimarães: `build_references.py --cell 30 --out out/reference-30m --manifest out/reference-30m/manifest.json`.
- Fontes de cada camada:
  - combustível: FUMOD do ano do fogo, vizinho mais próximo;
  - relevo: média do GLO-30;
  - barreiras: OSM;
  - coberto: média do TCD de 10 m;
  - hora de chegada observada: rasterizada ao centro das células de 30 m.
- O tempo meteorológico é o mesmo a qualquer resolução: ERA5 hora a hora.

### 2. Estado de partida

Cada simulação, desde a ignição ou no recomeço de cada intervalo, parte das células que o perímetro observado cobre, como células já ardidas (ADR 0063, ponto 6).

### 3. Que incêndios fazem sentido para o motor

Decidido só com os dados (`engine/scripts/fire-selection.ts`), sem pontuar nenhum modelo. Ficha: `engine/reports/selection-30m.json`.

- **Ajuste:**
  - tier A: o mapa de combustível é do ano do fogo;
  - pelo menos um intervalo pontuável (≥ 5 ha de área nova observada);
  - no máximo 25% da área ardida observada em células que o mapa diz não arderem (urbano, agrícola, água, rocha, estradas): aí o mapa e o fogo discordam, e o motor não o pode reproduzir;
  - pelo menos 60% da área ardida ardível em modelos de combustível com pelo menos 0,5% da área ardível de Guimarães: os combustíveis que o motor de facto queima em Guimarães.
- **Sem fogos fechados.** O primeiro rascunho deste protocolo guardava os incêndios do tier B a menos de 80 km para uma leitura final.
  - **Porquê não:** antes de pontuar qualquer modelo, a ficha de dados mostrou que o mapa de 2018 não descreve o que ardeu nesses fogos. As cicatrizes de 2016 aparecem a 85–98% como mato de regeneração (V-MH), e as de 2017 a 84–100% como não combustível.
  - **Consequência:** um teste nesses fogos mediria só o fator dos matos num combustível que não ardeu. A honestidade fica com a validação cruzada aninhada (ponto 6).

### 4. Objetivo

- O custo por intervalo da ADR 0054: (1 − Sørensen das células novas) + 0,5 × |ln(área simulada / observada)|, limitado a ln 5.
- Mínimo de 5 ha de área nova por intervalo e suavização de +1 ha (ADR 0063, ponto 7).
- Intervalos lentos pesam 0,25. Média por fogo, depois média dos fogos.
- Prior fraca para os valores físicos: 0,01 × Σ ln².

### 5. Parâmetros (espaço `groupsCrown`)

- **Ajustados:**
  - velocidade do sub-bosque (M), dos matos (V) e das herbáceas (H);
  - vento a meia chama;
  - largura que segura uma linha a 50%;
  - fator da velocidade do fogo de copas, com o fogo de copas ligado.
- **Físicos:** a folhada (rara em Guimarães) e a humidade do combustível morto (o ajuste a 100 m deu ≈ 0).
- **Ponto de partida:** todos os ajustes partem dos valores físicos.

### 6. Ajuste e testes

- **CMA-ES:** λ = 12, σ = 0,7 em escala logarítmica, semente 1.
- **Ajuste principal:** 60 gerações nos fogos de ajuste.
- **Fogos de teste:**
  - 5 partes por fogo, um ano de fora de cada vez e o Norte de fora;
  - 40 gerações cada;
  - cada ajuste só vê os fogos de treino.
- **Incerteza:** 10 reajustes bootstrap de 20 gerações, cada um a partir dos valores físicos.

### 7. Incumbente e regra de adoção

- O incumbente é o **modelo físico** (sem calibração), porque a grelha de 30 m não tem calibração própria.
- A calibração adota-se se, nos fogos de teste das 5 partes, emparelhados fogo a fogo:
  - o custo descer pelo menos 0,02, com o intervalo de 90% (bootstrap sobre os fogos) abaixo de 0;
  - o Sørensen desde a ignição não descer mais de 0,01;
- Senão, a grelha de 30 m usa o modelo físico.

### 8. Hipóteses estruturais

- Cada uma com as mesmas 5 partes (mesmos fogos, mesma semente, 40 gerações), comparada com a base fogo a fogo (`engine/scripts/compare-calibrations.ts`):
  1. **sem fogo de copas** (`groupsNoCrown`);
  2. **um fator único** para todos os combustíveis (`globalCrown`);
  3. **razão de copa 0,5** no abrigo do vento (`crownRatio` = 0,5, como no BehavePlus para copas a meia altura);
  4. **relevo suavizado ±30 m** antes do declive (`demSmoothM` = 30).
- Uma hipótese substitui a base só se passar a mesma regra contra a base. Num empate fica a base.
- Mais hipóteses não: com cerca de 30 fogos, só diferenças de custo de 0,04 ou mais se distinguem.

### 9. Mapa de cenários

- `reliability.ts` com os parâmetros finais, nos mesmos fogos.
- Com `--extend`: uma escala acima do limite de plausibilidade, para ver se o Brier inverte.
- `holdSteepness` (2, 3, 5) verificado com as corridas aleatórias.

### 10. Leitura

- O Norte e os fogos mais parecidos com Guimarães reportam-se sempre, mas nunca decidem.

## Resultados

Relatório `engine/reports/pt-firesprd-30m-2026-10-20-base.json` (147 min, 7 núcleos). Hipóteses e ajuste exploratório em `LinhaZero-data/hyp/`, fora do git.

### Ajuste principal: não adotado

- **Melhor ajuste:**
  - sub-bosque 1,00, matos 0,79, herbáceas 0,82;
  - vento 0,81;
  - linhas 1,00, fogo de copas 1,00.
- **Intervalos de 90% do bootstrap:**
  - matos 0,45–0,96, herbáceas 0,42–0,94;
  - vento 0,63–1,53;
  - sub-bosque 0,52–1,23, linhas 0,68–1,77, fogo de copas 0,65–1,34.
- **Fogos de teste (5 partes, 19 fogos):**
  - custo 1,069 contra 1,095 do modelo físico;
  - Sørensen desde a ignição 0,329 contra 0,332.
- **Emparelhado:** custo −0,025 (90%: −0,065 a +0,016), Sørensen −0,003. O intervalo cruza o 0, por isso **não adotar**.
- **Velocidade nos fogos de teste, simulada / observada:**
  - corridas rápidas 0,37, contra 0,55 do modelo físico;
  - intervalos lentos 1,20, contra 2,0.

  O ajuste abranda tudo: acerta as noites e piora os picos.
- **Brier (20 realizações):** só o melhor 0,049, com as amostras 0,044, modelo físico 0,062.

### Hipóteses (§8): nenhuma substitui a base

Comparadas com a base, fogo a fogo, nos mesmos 19 fogos de teste (`compare-calibrations.ts`):

| Hipótese | Custo contra a base (90%) | Sørensen contra a base | Custo nos fogos de teste |
| --- | --- | --- | --- |
| Sem fogo de copas | +0,017 (+0,002 a +0,035) | +0,001 | 1,087 |
| Fator único | −0,001 (−0,012 a +0,009) | +0,008 | 1,068 |
| Razão de copa 0,5 | +0,008 (−0,001 a +0,017) | −0,013 | 1,078 |
| Relevo suavizado ±30 m | +0,004 (−0,004 a +0,013) | +0,011 | 1,073 |

### Exploratório, fora do protocolo: ajuste só no fogo livre

- **Ajuste:** sub-bosque 0,90, matos 0,87, herbáceas 0,80, vento 0,81.
- **Fogos de teste:** custo do fogo livre 1,046 contra 1,065 do físico (emparelhado −0,019, 90%: −0,061 a +0,026).
- **Corridas rápidas:** 0,375 da velocidade observada.
- **Leitura:** mesmo sem os intervalos combatidos, os fogos pedem menos velocidade, e nenhum destes fatores resolve as corridas rápidas.

### Desvio do protocolo: o que a grelha de 30 m usa

- **O que a regra dava:** o modelo físico.
- **O que se viu antes de o aplicar:** os valores da grelha de 100 m (`PT_CALIBRATION`), pontuados nos mesmos casos de 30 m, ganham ao modelo físico. Nunca foram ajustados a 30 m.

  | Contra o modelo físico | 19 fogos | 13 fogos fora do ajuste de 100 m |
  | --- | --- | --- |
  | Custo por intervalo | −0,021 (90%: −0,039 a −0,003) | −0,021 (90%: −0,042 a +0,002) |
  | Sørensen desde a ignição | +0,066 (0,332 → 0,398) | +0,061 (90%: +0,016 a +0,113) |
- **Decisão (do utilizador):** a grelha de 30 m fica com os valores da de 100 m (`PT_CALIBRATION_30M = PT_CALIBRATION`), em vez de passar ao modelo físico. É um desvio declarado da regra deste protocolo.
  - **Porquê:** passar ao modelo físico baixaria o acerto desde a ignição, que é o que a aplicação mostra.
- **Porque é que o ajuste não os encontrou:**
  - o objetivo só vê o custo por intervalo, e aí o ajuste ganha dentro da amostra (1,056 contra 1,073);
  - a partir dos valores físicos, o CMA-ES não chega a vento ×2,5.
- **O que fica por saber:** os fogos alongados acertam melhor desde a ignição. Falta saber se isso vem do vento, das linhas que cedem mais ou do fogo de copas mais lento.
- **Recalibração:** [plano-refit-30m.md](../plano-refit-30m.md). Usa um objetivo com o Sørensen desde a ignição, vários pontos de partida e uma regra fixada antes de correr.

### CI

- `engine/test/reference-30m.test.ts`: Baião, Valença e Valpaços a 30 m, registados com `PT_CALIBRATION_30M`.
- `calibration.test.ts`: verifica que o motor segue este veredicto.
