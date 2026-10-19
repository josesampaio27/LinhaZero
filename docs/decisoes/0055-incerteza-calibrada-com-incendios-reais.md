# ADR 0055: Probabilidade de arder calibrada com incêndios reais

- Estado: aceite; o mapa de recalibração foi retirado pela [ADR 0057](0057-fogo-sem-combate-e-corridas-rapidas.md) (o motor simula o fogo sem combate), as perturbações ficam
- Data: 2026-10-19

## Decisão

- **Mais incerteza no ensemble do Rothermel:** além do vento, cada corrida sorteia:
  - a humidade do combustível morto, ±4 pontos;
  - um fator de velocidade por grupo de combustível (desvio de 0,6 em log);
  - o ponto de ignição, até 400 m (não quando se desenha a área já ardida).

  O vento passa a variar ±30° e ±37%. Os sorteios vêm de `hashRandom(seed, run, …)`, por isso dependem só da semente e da corrida: o emparelhamento A/B mantém-se.
- **Recalibração:** o mapa mostra a probabilidade de arder calibrada (`burnChance`), não a fração de corridas.
  - É um mapa monótono (isotónico, por intervalos de 5%), ajustado nos 32 incêndios do tier A, de "fração de corridas que ardem" para "fração de células que arderam de facto".
- **Área esperada:** o painel de comparação mostra a área ardida esperada (soma das probabilidades) em vez da área com probabilidade ≥ 50%.
- **Onde se aplica:**
  - os valores estão em `engine/src/calibration.ts`: `BURN_CHANCE_ENSEMBLE` e `BURN_CHANCE_MAP`;
  - a interface e o servidor usam o mesmo ensemble (`rothermelEnsemble`), e o servidor nunca aceita as perturbações do cliente;
  - o modelo simples fica como estava.

## Porquê

- **O mapa antigo era confiante demais.** Medido desde a ignição nos fogos de teste (`npm run reliability -w engine`, 5 partes), as células com 95–100% das corridas a arder só arderam em 31% dos casos. A área "provável" era 3 vezes a real. O motor não tem combate, e os fogos reais foram combatidos.
- **Resultados nos fogos de teste:**

  | Ensemble | Brier | Cobertura (células ardidas com ≥ 10%) |
  | --- | --- | --- |
  | Só vento (antes) | 0,214 | 88% |
  | Com as perturbações | 0,194 | 94% |
  | Com as perturbações e recalibrado | **0,084** | 82% |

  No tier B (fogos de 2015–2017, só validação), o Brier desce de 0,157 para 0,110.
- **Perturbações com limites físicos:** escalas maiores ainda baixavam o Brier, mas só por espalhar o mapa, o que esconde o viés em vez de o corrigir. A recalibração é que corrige o viés.

## Consequências

- **Probabilidades mais baixas:** onde todas as corridas ardem, a probabilidade mostrada é cerca de 40%, porque é isso que os incêndios reais fizeram. A legenda explica que inclui o efeito típico do combate.
- **Comparar decisões não muda:** as métricas emparelhadas usam as corridas, não o mapa calibrado.
- **Desempenho:** o ensemble de 30 corridas em Guimarães a 30 m passa de 107 para 130 ms.

## Alternativas consideradas

- **Só alargar as perturbações:** baixa o Brier menos e com valores fisicamente implausíveis (humidade ±8 pontos, fator de velocidade ×3).
- **Medir por intervalo:** recomeçar de todo o perímetro observado faz arder todas as frentes, também as que estavam extintas, e sobrestima cerca de 3 vezes. Fica no relatório como diagnóstico.
