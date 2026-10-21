# ADR 0065: Calibração da grelha de 30 m pela cobertura do fogo real

- Estado: proposta (protocolo registado antes de pontuar qualquer modelo com esta pontuação nos fogos de ajuste; os resultados entram no fim)
- Data: 2026-10-21
- Completa a [ADR 0064](0064-calibracao-da-grelha-de-30-m.md) e substitui a regra de adoção do [plano de recalibração](../plano-refit-30m.md)

## Contexto

- **O motor simula o fogo sem combate** ([ADR 0057](0057-fogo-sem-combate-e-corridas-rapidas.md)). Os incêndios do PT-FireSprd foram todos combatidos. Contra eles, um motor certo arde mais do que o fogo real onde os meios o travaram.
- **Todas as pontuações eram simétricas.** O Sørensen, o erro de crescimento e a regra de adoção contavam um hectare a mais como um hectare a menos. Um ajuste aprende assim a imitar o combate.
- **Foi o que fez o ajuste da ADR 0064.** Nos 19 fogos a 30 m, desde a ignição:

  | | Cobertura da área ardida real | Área simulada / real (mediana) | Fogos que arderam menos do que o real |
  | --- | --- | --- | --- |
  | Modelo físico | 0,55 | ×2,8 | 4 |
  | Valores da grelha de 100 m (em uso) | 0,75 | ×4,1 | 1 |
  | Ajuste da ADR 0064 (não adotado) | 0,44 | ×1,5 | 7 |

- **O que se faz noutros simuladores:** o W.I.S.E. (Bennett et al. 2026) avalia só fogos sem combate, o que em Portugal não é possível. O FSim (Finney et al. 2009, 2011, 2025) e o Burn-P3 modelam o combate à parte, só para calibrar. Os modelos de velocidade avaliam-se nas corridas que o combate não trava (Cruz e Alexander 2013).

## Protocolo (registado antes de ver resultados)

### 1. Casos, partes e semente

- Os mesmos 19 fogos da ADR 0064 (`engine/reports/selection-30m.json`), as mesmas 5 partes (semente 1) e o mesmo estado de partida (ADR 0063).

### 2. Pontuação de cobertura (por intervalo, `engine/scripts/intervals.ts`, `COVERAGE`)

- **Sobreposição assimétrica:** 1 − Tversky(α = 0,2 para a área a mais, β = 0,8 para a área em falta). Falhar um hectare custa 4 vezes mais do que arder um a mais.
- **Área em falta:** 0,5 × ln(observada / simulada), só quando a simulação arde menos.
- **Área a mais:** 0,5 × (ln(simulada / observada) − ln 3), só acima de 3 vezes a área observada e só nos intervalos em que o fogo corria livre. Nos lentos (noites, fogo travado) só conta o que falta.
- Os dois termos de área têm +1 ha dos dois lados e o limite ln 5, como antes. Os pesos dos intervalos ficam (livres 1, lentos 0,25).
- **Flancos travados:**
  - um troço da borda de partida está travado quando nenhuma célula observada a arder durante o intervalo fica a menos de 150 m dele;
  - a área simulada mais perto de um troço travado do que de um ativo não conta como área a mais.

  Decide-se só com a observação.
- **Velocidade da cabeça:** por fogo, 0,5 × a média de |ln(velocidade simulada / observada)|, nos intervalos com uma velocidade do PT-FireSprd acima de 15 m/min e qualidade de pelo menos 3. Aí os meios não seguram o fogo.
  - A velocidade é o percentil 90 da distância das células novas à área de partida, por minuto, medida igual na simulação e na observação.
  - A escolha dos intervalos não depende dos parâmetros.

### 3. Objetivo combinado

- Por fogo: a pontuação de cobertura dos intervalos + λ × (1 − Tversky desde a ignição), com λ = 1.
- Média dos fogos, mais a prior fraca de sempre: 0,01 × Σ ln².

### 4. Parâmetros, pontos de partida e ajuste

- **Espaço `groupsCrown`:** sub-bosque, matos, herbáceas, vento a meia chama, largura das linhas e velocidade do fogo de copas, com o fogo de copas ligado.
- **Dois pontos de partida em cada ajuste:**
  - os valores físicos;
  - o vento ×2 com o resto físico.

  Fica o melhor dos dois. O segundo não é a calibração de 100 m: a ADR 0064 mostrou que, partindo só dos valores físicos, o CMA-ES não chega à região de vento alto.
- **CMA-ES:** λ = 12, σ = 0,7. Cada partida tem a sua semente (semente + 7919 × k).
- **Gerações:** 60 no ajuste principal, 40 em cada parte e 20 em cada um dos 10 reajustes bootstrap.
- **Regra de paragem:** a melhoria do melhor fica abaixo de 0,001 em 10 gerações, com o passo abaixo de 0,05.

### 5. Incumbente e regra de adoção

- O incumbente são os valores em uso na grelha de 30 m (`PT_CALIBRATION`).
- A calibração nova adota-se se, nos fogos de teste das 5 partes, emparelhados fogo a fogo:
  - o custo combinado descer pelo menos 0,02, com o intervalo de 90% (bootstrap sobre os fogos) abaixo de 0;
  - **e** a cobertura desde a ignição não descer mais de 0,01;
  - **e** o erro da velocidade da cabeça não subir mais de 0,05.
- **Decidem os 19 fogos.** O incumbente foi ajustado em 6 deles (a 100 m), o que favorece o incumbente. Os 13 que nunca viu reportam-se à parte.
- Senão ficam os valores em uso.

### 6. Hipótese: combate de fundo só na calibração

- **O quê:** um "Ataque" em todas as células desde o minuto 0, com um fator ajustado (`bgSuppression`, espaço `groupsCrownSupp`) que perde o efeito com a intensidade, como qualquer ataque.
- **Porquê:** representa o combate dos fogos reais, à maneira do FSim. Os parâmetros físicos não o têm de absorver.
- **Nunca chega à aplicação:** `rothermelParams` retira-o, mesmo de um ficheiro de variante.
- **Teste:** as mesmas 5 partes, comparada com a base fogo a fogo pela mesma regra (`compare-calibrations.ts`). Num empate fica a base.

### 7. Leituras sem decisão

- **Separar as alavancas:** voltar a pontuar o melhor ajuste com a largura das linhas, o fogo de copas e o vento, um de cada vez, no valor físico (`score-levers.ts`).
- **Mapa de cenários:** `reliability.ts` com os parâmetros finais e `--extend`, e o `holdSteepness` a 2, 3 e 5.

### 8. Declaração

O peso de 4 para 1 escolheu-se depois de ver, desde a ignição nestes 19 fogos, o Tversky(0,2; 0,8) do modelo físico (0,41), dos valores em uso (0,51) e do ajuste da ADR 0064 (0,37). Nenhum outro valor desta ADR se escolheu a olhar para pontuações.

## Execução mais rápida, com os mesmos resultados

O que antes levava cerca de 8 horas: o ajuste base, 4 hipóteses, o ajuste em fogo livre e o mapa de cenários.

Mudanças que não mudam nenhum número:
- **Relevo:** era recalculado em cada recomeço com células já ardidas. A cache passa a usar o relevo e não a grelha.
- **Cache por intervalo:** o que não depende dos parâmetros guarda-se por intervalo (área de partida, combustível já ardido, tempo, distâncias, flancos travados).
- **Mapa de cenários:** cada fogo usa um só ensemble, lido em várias horas, em vez de um por hora.
- **Ajustes ao mesmo tempo:** o principal, as partes, o bootstrap e as duas partidas correm juntos, com os maiores fogos primeiro e todos os núcleos.

`engine/scripts/bench-calibration.ts` dá o mesmo SHA-256 antes e depois. Os testes em `engine/test/calibration-speed.test.ts` comparam com o caminho antigo.

A regra de paragem (ponto 4) muda pouco os resultados. Validou-se repetindo o protocolo da ADR 0064 com tudo isto ligado:
- **O mesmo veredicto,** com o emparelhado a −0,025 (90%: −0,064 a +0,016), contra −0,025 (−0,065 a +0,016).
- **Os seis fatores** ficam dentro dos intervalos bootstrap de então, por exemplo vento 0,80 contra 0,81.
- **O ajuste principal** parou na geração 41 de 60, com o objetivo a 1,0557 contra 1,0555.
- **147 → 115 minutos,** com a máquina partilhada com a construção dos casos de 100 m.

## Resultados

Por preencher depois das corridas.
