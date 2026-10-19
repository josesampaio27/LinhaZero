# ADR 0056: Fogo de copas no modelo de Rothermel

- Estado: aceite
- Data: 2026-10-19

## Decisão

- **Quando o fogo sobe às copas:** um fogo de superfície num combustível florestal sobe às copas quando a sua intensidade chega à intensidade crítica de Van Wagner (1977): I₀ = (0,010 · CBH · (460 + 25,9 · FMC))^1,5. CBH é a altura da base das copas e FMC a humidade foliar (100%).
- **Velocidade nas copas:** a velocidade é a de Cruz et al. (2005):
  - R_a = 11,02 · U₁₀^0,90 · CBD^0,19 · e^(−0,17 · EFFM), com o vento a 10 m em km/h, CBD a densidade aparente das copas e EFFM a humidade do combustível morto fino em %;
  - o fogo é ativo quando R_a ≥ 3 / CBD, e passivo, a R_a · e^(−R_a·CBD/3), abaixo disso.
  - Fica a mais rápida entre a superfície e as copas. A intensidade soma o combustível das copas consumido, por isso os ataques e as linhas veem a intensidade do fogo de copas.
- **Onde:** só em modelos florestais com copas (pinheiro, resinosas, eucalipto, esclerófilas) e em células com pelo menos 30% de coberto arbóreo. Os valores de CBH, CBD e carga de copas por modelo estão no `data-prep/fuel_params.csv` e são **provisórios** (povoamentos típicos).
- **Na calibração:** `PT_CALIBRATION` liga o fogo de copas (`crownFire` 1) a 0,35 × a velocidade de Cruz (`crownAdj`). Uma variante de grelha pode desligá-lo.

## Porquê

- **Resultados:** com o fator escolhido por validação cruzada em 5 partes nos 32 fogos do tier A, nos fogos de teste:
  - o Sørensen desde a ignição sobe de 0,390 para 0,395;
  - o custo por intervalo fica igual (1,150 contra 1,148);
  - o tier B não muda.
- **Porque um fator abaixo de 1:** a velocidade de Cruz completa (fator 1) dá mais Sørensen (0,401), mas piora o custo por intervalo. Os fatores entre 0,35 e 0,75 empatam.

## Consequências

- **Não resolve as corridas rápidas.** Nos 84 intervalos com mais de 15 m/min medidos, a velocidade simulada mediana continua em 10 m/min, contra 18 m/min observados. Esses fogos rápidos são sobretudo de matos, não de floresta.
  - Pôr a velocidade a 1 em vez de 0,5 acerta nesses intervalos, mas estraga os lentos (Sørensen 0,30).
  - Há por isso um viés que um único fator não corrige: o motor é lento nos picos e rápido nas acalmias.
- **Copas a melhorar:** CBH e CBD por modelo são valores típicos, não medidos. Um mapa de altura e densidade das copas (LiDAR, ou o inventário florestal nacional) melhoraria o resultado.
- **Probabilidade:** a probabilidade calibrada ([ADR 0055](0055-incerteza-calibrada-com-incendios-reais.md)) foi refeita com o fogo de copas ligado. O Brier nos fogos de teste fica em 0,084.

## Alternativas consideradas

- **Deixar desligado:** os fogos de teste dão um ganho pequeno mas consistente ao ligá-lo, e o motor fica fisicamente mais completo nos povoamentos de pinheiro.
- **Fogo de copas com a velocidade completa de Cruz:** mais Sørensen, mas pior custo por intervalo; fica fora pela regra de adoção.
