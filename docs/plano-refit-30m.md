# Plano: recalibrar a grelha de 30 m

> **Estado (2026-10-21):** substituído pela [ADR 0065](decisoes/0065-calibracao-por-cobertura-30-m.md).
>
> - **O objetivo combinado** usa a pontuação de cobertura em vez do Sørensen, que é simétrico.
> - **A regra de adoção** muda: decidem os 19 fogos, pelo custo combinado, a cobertura desde a ignição e a velocidade da cabeça.
> - **O segundo ponto de partida** é o vento ×2, não os valores de 100 m.
>
> O resto deste plano (mesmos fogos, partes e semente; separar as alavancas; mapa de cenários) mantém-se.

Para fazer mais tarde. Hoje (2026-10-20) a grelha de 30 m usa os mesmos valores da de 100 m (`PT_CALIBRATION_30M = PT_CALIBRATION`), mantidos com provas a 30 m ([ADR 0064](decisoes/0064-calibracao-da-grelha-de-30-m.md), Resultados). Este plano diz o que falta para a grelha de 30 m ter uma calibração própria.

## Porque é preciso

- **O ajuste a 30 m não passou a regra.** Partindo dos valores físicos, nos 19 fogos selecionados, o melhor ajuste baixou o custo por intervalo nos fogos de teste de 1,095 para 1,069. O intervalo de 90% emparelhado (−0,065 a +0,016) cruza o 0, e nenhuma das quatro hipóteses estruturais ganhou ao ajuste.
- **Os valores de 100 m ganham nos fogos de 30 m que nunca viram.** Nos 13 fogos fora do ajuste de 100 m:

  | Contra o modelo físico | Diferença | Intervalo de 90% |
  | --- | --- | --- |
  | Sørensen desde a ignição | +0,061 | +0,016 a +0,113 |
  | Custo por intervalo | −0,021 | −0,042 a +0,002 |

  Têm vento ×2,5 e velocidade ×0,5. Todos os ajustes a 30 m ficaram com vento perto de 0,8, e o bootstrap nunca passou de 1,53.
- **O objetivo não vê o que a aplicação mostra.** O ajuste minimiza o custo por intervalo, que recomeça de cada frente observada. A aplicação simula desde a ignição. No custo por intervalo, o ajuste ganha aos valores de 100 m dentro da amostra (1,056 contra 1,073), mas desde a ignição perde por muito (0,33 contra 0,40). Os fogos alongados (vento alto, velocidade baixa) acertam melhor a forma ao fim de horas, mesmo que cada intervalo isolado não ganhe.
- **Desconhecido:** se a vantagem desde a ignição vem do alongamento (vento), das linhas que cedem mais (largura 5) ou do fogo de copas mais lento (0,35). Os três mudam juntos.

## O que correr

1. **Objetivo combinado** (`calibrate.ts`, nova opção `--objective mixed`): custo por intervalo + λ × (1 − Sørensen desde a ignição), com λ = 1 fixado antes de correr. O Sørensen desde a ignição já é calculado para os fogos de teste. Falta pô-lo no objetivo do ajuste, no `calibration-pool.ts`.
2. **Vários pontos de partida:** cada ajuste (principal, 5 partes, bootstrap) parte dos valores físicos **e** de vento ×2,5 com velocidade ×0,5, e fica com o melhor. Com σ = 0,7 a partir do físico, o CMA-ES não chega à região de vento alto. Os dois pontos de partida decidem-se antes de pontuar.
3. **Mesmos fogos, partes e semente** da ADR 0064 (`reports/selection-30m.json`, semente 1). Assim compara-se emparelhado com o relatório `pt-firesprd-30m-2026-10-20-base.json` e com os valores de 100 m (`prev30` abaixo).
4. **Regra de adoção** (fixada agora, antes de correr): o novo ajuste substitui os valores de 100 m na grelha de 30 m se, nos fogos de teste emparelhados:
   - o custo por intervalo não subir mais de 0,01;
   - o Sørensen desde a ignição subir, com o intervalo de 90% acima de 0.

   Se não passar, os valores de 100 m ficam.
5. **Separar as três alavancas:** com o melhor ajuste, voltar a pontuar com a largura das linhas ou o fogo de copas no valor físico, uma de cada vez. Diz o que de facto dá a vantagem desde a ignição.
6. **Mapa de cenários:** `reliability.ts --cases ../data-prep/out/reference-30m --select reports/selection-30m.json --params '<final>' --extend --label 30m`, e depois o `holdSteepness` (2, 3, 5) com `--fixed holdSteepness=…`. Cada corrida a 30 m leva cerca de uma hora: hoje só correu a dos valores de 100 m.

## Tempo

- Ajuste com 5 partes e bootstrap: cerca de 2,5 h com 7 núcleos.
- O objetivo combinado custa pouco mais: o Sørensen desde a ignição é uma corrida por fogo, contra uma por intervalo.
- Mapa de cenários: cerca de 1 h por corrida.

## Ficheiros

- Casos de 30 m: `data-prep/out/reference-30m` (`build_references.py --cell 30 --out out/reference-30m --manifest out/reference-30m/manifest.json`).
- Seleção: `engine/reports/selection-30m.json`.
- Relatórios de hoje:
  - `engine/reports/pt-firesprd-30m-2026-10-20-base.json`;
  - hipóteses e fogo livre em `LinhaZero-data/hyp/` (fora do git);
  - `prev30.json`, com os valores de 100 m pontuados nos 19 fogos (fora do git).
- Comparar dois relatórios: `engine/scripts/compare-calibrations.ts <base.json> <hipótese.json>`.
