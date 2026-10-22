# ADR 0074: Protocolo da etapa B: quando se adota uma mudança da física

- Estado: aceite (registado antes de pontuar qualquer mudança da etapa B)
- Data: 2026-10-22
- Etapa B do plano [Melhorias do motor](../plano/melhorias-do-motor.md); segue as regras de honestidade das ADRs [0053](0053-validacao-e-calibracao-com-o-pt-firesprd.md) e [0068](0068-calibracao-por-cobertura-30-m.md)

## Contexto

A etapa B muda a física do motor (forma do fogo, modelo de matos, humidade, dados, faúlhas, vento). A recalibração fica para a etapa D. Cada mudança precisa de uma regra de adoção fixada antes de se ver qualquer resultado, para não se escolher a regra que favorece a mudança.

## Decisão

- **Casos:** os incêndios do PT-FireSprd construídos a 100 m por `data-prep/build_references.py` (`data-prep/out/reference`). Decidem os **incêndios do tier A fora do ajuste** (os que não estão em `PT_CALIBRATION_SEEN`). O tier B é mostrado à parte e não decide.
- **Motor:** a calibração em uso (`PT_CALIBRATION`) mais a opção a testar; simulação sem sorteios; tempo ERA5 hora a hora e humidade NFDRS, como hoje.
- **Medidas**, nos incêndios que decidem (`engine/scripts/compare-models.ts`):
  - **S:** Sørensen médio nas horas observadas, desde a ignição;
  - **C:** custo por intervalo (`weightedCost`, ADR 0064), média por incêndio;
  - **F:** mediana de velocidade simulada / observada nos intervalos com velocidade L2 acima de 15 m/min (corridas rápidas), todos os incêndios juntos.
- **Guardas** (todas as mudanças): S não desce mais de 0,01 e C não sobe mais de 0,02.
- **Objetivo** (fixado por marco antes de correr):
  - M4 (forma do fogo, matos): |ln F| desce pelo menos 0,05;
  - M5 a M8: C desce pelo menos 0,02 ou S sobe pelo menos 0,01, salvo se a ADR do marco fixar outro antes.
- **Incerteza:** intervalo de 90% por bootstrap emparelhado sobre os incêndios (1000 reamostragens, semente 2035) para a diferença de S e de C. Fica registado; a decisão é pela regra acima.
- **Adotar** é pôr a opção por omissão (`DEFAULT_PARAMS`). Os números publicados (`site-data.json`) só se regeneram na etapa D, com a recalibração.

## Consequências

- Uma mudança que piora o ajuste atual mas que poderia ganhar depois de recalibrar não é adotada agora; fica registada e volta a ser testada na etapa D, com a recalibração.
- Os resultados de cada teste ficam em `engine/reports/stage-b-*.json` e no fim desta ADR.

## Resultados

Corridos a 22 de outubro de 2026, nos 27 incêndios do tier A fora do ajuste, com a calibração em uso. S: Sørensen desde a ignição (maior é melhor); C: custo por intervalo (menor é melhor); F: velocidade simulada / observada nas corridas rápidas (1 = certo). Entre parênteses, o intervalo de 90% da diferença. Relatórios em `engine/reports/stage-b-*.json`.

| Mudança | S | C | F | Tier B (S, C) | Pela regra |
| --- | --- | --- | --- | --- | --- |
| M4 matos (`shrubModel=1`) | 0,400 → 0,400 (−0,030 a +0,032) | 1,047 → 1,034 (−0,080 a +0,040) | 0,68 → 0,99 | 0,153 → 0,135; 1,453 → 1,483 | passa |
| M4 forma do fogo (`shapeModel=1`) | 0,400 → 0,381 (−0,036 a −0,001) | 1,047 → 1,101 (+0,026 a +0,081) | 0,68 → 0,66 | 0,153 → 0,159; 1,453 → 1,454 | não passa |
| M4 as duas | 0,400 → 0,412 (−0,010 a +0,034) | 1,047 → 1,036 (−0,052 a +0,027) | 0,68 → 0,98 | 0,153 → 0,152; 1,453 → 1,470 | passa |
| M5 humidade FFMC | 0,400 → 0,352 (−0,086 a −0,014) | 1,047 → 1,133 (+0,042 a +0,131) | 0,68 → 0,57 | 0,153 → 0,164; 1,453 → 1,478 | não passa |
| M8 vento no relevo (`terrainWind=1`) | 0,400 → 0,398 (−0,005 a +0,001) | 1,047 → 1,048 (−0,005 a +0,006) | 0,68 → 0,67 | 0,153 → 0,155; 1,453 → 1,457 | não passa (sem ganho) |

Verificação à parte, que a regra não mede: a velocidade nos intervalos lentos (L2 abaixo de 5 m/min, 26 intervalos), em que o motor sem combate já anda depressa de mais (onde os meios travaram o fogo): simulada / observada 2,6 hoje, 3,5 com o modelo de matos, 2,8 com as duas mudanças.

Adoção: nenhuma mudança fica ligada. As duas linhas que passaram foram testadas com uma calibração própria na etapa D e não passaram a regra da ADR 0068 ([ADR 0077](0077-recalibracao-com-matos-e-forma-do-fogo.md)); a humidade FFMC e o vento no relevo não passaram aqui.
