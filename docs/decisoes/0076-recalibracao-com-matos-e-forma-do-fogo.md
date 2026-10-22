# ADR 0076: Recalibração da grelha de 100 m com o modelo de matos e a forma do fogo

- Estado: aceite: não se adota (o protocolo foi registado antes de correr; resultados no fim)
- Data: 2026-10-22
- Etapa D do plano [Melhorias do motor](../plano/melhorias-do-motor.md), marco M11; segue as ADRs [0068](0068-calibracao-por-cobertura-30-m.md), [0069](0069-recalibracao-da-grelha-de-100-m.md) e [0073](0073-protocolo-da-etapa-b.md)

## Contexto

- Na etapa B ([ADR 0073](0073-protocolo-da-etapa-b.md)), o modelo de matos de Anderson et al. (2015) com a forma do fogo de Taylor et al. (1997) (`shrubModel=1`, `shapeModel=1`) passou a regra com a calibração em uso: corridas rápidas de 0,68 para 0,98 da velocidade observada, Sørensen de 0,400 para 0,412 (intervalo de 90% de −0,010 a +0,034).
- Mas a calibração em uso foi ajustada para o Rothermel, e a forma do fogo sozinha piorava. Decidiu-se testar as duas mudanças com uma calibração própria antes de as adotar.
- Antes de correr, `engine/scripts/check-calibration.ts` verificou que:
  - o motor de hoje, sem as opções, reproduz o objetivo do melhor ajuste da ADR 0069 com o motor dessa altura (1,4438 com os dois motores; o relatório registou 1,4425, porque os casos foram reconstruídos a 22 de outubro de 2026 a partir de fontes que mudam, como o OpenStreetMap);
  - as opções chegam às simulações da calibração;
  - todas as dimensões do espaço mexem no custo com as opções ligadas. Para isso, o fator do grupo dos matos (`rosAdjShrub`) passou a aplicar-se à velocidade de Anderson (sem o fator global, que compensa o Rothermel; a intensidade vem da velocidade sem fator, como no Rothermel). Com o fator a 1, o modelo é o publicado, e os resultados da ADR 0073 não mudam.

## Protocolo (registado antes de ver resultados)

- **Casos:** os 80 incêndios a 100 m em `data-prep/out/reference`, construídos a 22 de outubro de 2026.
- **Fogos:** a seleção da ADR 0069 (`engine/reports/selection-100m.json`, 19 incêndios de ajuste).
- **Pontuação, objetivo, espaço e ajuste:** os da ADR 0069: objetivo combinado de cobertura (`coverageMixed`), espaço `groupsCrown`, partidas `physical` e `wind2`, semente 1, 60 gerações, 40 por parte, 10 reajustes bootstrap de 20, as 5 partes e as divisões por ano e sem o Norte. **Fixos:** `crownFire=1`, `shrubModel=1`, `shapeModel=1`.
- **Comando:**

  ```bash
  npx tsx scripts/calibrate.ts --select reports/selection-100m.json --objective coverageMixed --space groupsCrown \
    --fixed crownFire=1,shrubModel=1,shapeModel=1 --starts physical,wind2 --bootstrap 10 \
    --label stage-d-shrub-shape --outdir reports
  ```

- **Decisão: a regra da ADR 0068 contra a calibração em uso** (`PT_CALIBRATION`, o que a aplicação usa hoje), nos fogos de teste das 5 partes, emparelhados:
  - o custo combinado desce pelo menos 0,02, com o intervalo de 90% abaixo de 0;
  - a cobertura desde a ignição não desce mais de 0,01;
  - o erro da velocidade da cabeça não sobe mais de 0,05.
- **Leitura que não decide:** `compare-calibrations.ts` contra a recalibração do motor de hoje da ADR 0069 (`engine/reports/pt-firesprd-2026-10-21.json`, mesmas partes e semente), para ver se o ganho vem das opções ou só de recalibrar. Esses casos eram de outra construção (diferença de 0,09% no objetivo), o que se diz junto do resultado.
- **Se passar:** `PT_CALIBRATION` passa a ser o ajuste novo com as opções (e as amostras do bootstrap), `DEFAULT_PARAMS` fica com `shrubModel=1` e `shapeModel=1`, e regeneram-se `site-data.json`, a ficha técnica e a documentação (M13).
- **Se não passar:** as opções ficam no código, desligadas, e o resultado fica registado aqui.

## Resultados

Corrida a 22 de outubro de 2026, em 108 minutos (`engine/reports/pt-firesprd-2026-10-22-stage-d-shrub-shape.json`).

### Ajuste

- **Melhor ajuste nos 19 incêndios:** sub-bosque ×3,09, matos ×0,82, herbáceas ×1,16, vento ×1,59, linhas seguras com 2,87 comprimentos de chama, fogo de copas ×0,62 (partida `wind2`).
- **Intervalos de 90% do bootstrap:** sub-bosque 1,77–6,67, matos 0,60–1,35, herbáceas 0,58–1,80, vento 1,13–3,13, linhas 1,07–4,89, copas 0,50–2,11. O fator dos matos fica perto de 1: o modelo publicado quase não precisa de ajuste. O vento desce de ×2,5 para ×1,6.

### Decisão (regra da ADR 0068, contra a calibração em uso, nos 19 fogos de teste das 5 partes)

| Medida | Resultado | Regra | |
| --- | --- | --- | --- |
| Custo combinado | −0,048 (90%: −0,174 a +0,077) | ≤ −0,02 com o intervalo abaixo de 0 | falha: o intervalo passa o 0 |
| Cobertura desde a ignição | +0,011 | não desce mais de 0,01 | passa |
| Erro da velocidade da cabeça | −0,082 (12 fogos) | não sobe mais de 0,05 | passa |

**Não se adota.** Nos 13 fogos que a calibração em uso nunca viu, o ganho é maior (custo −0,120, 90%: −0,291 a +0,053; cobertura +0,021; cabeça −0,102), mas o intervalo também passa o 0.

### Leitura que não decide: contra a recalibração do motor de hoje (ADR 0069)

`compare-calibrations.ts`, mesmas partes e semente: custo −0,049 (90%: −0,177 a +0,082), cobertura +0,009, cabeça −0,061. As duas opções ajudam um pouco, mas também sem certeza.

### Outras leituras

- **Corridas rápidas:** velocidade simulada / observada 1,07 com o ajuste novo, 0,66 com a calibração em uso: o maior erro medido fica resolvido.
- **Intervalos lentos:** 3,1, contra 2,3 com a calibração em uso: o fogo sem combate anda ainda mais depressa onde os meios o travaram.
- **Sørensen desde a ignição** (que o objetivo de cobertura não pontua diretamente): 0,372, contra 0,406 com a calibração em uso.
- **Mapa de cenários (Brier, 20 realizações):** 0,055 com as amostras, contra 0,053 com a calibração em uso.

### Consequências

- `shrubModel` e `shapeModel` ficam no código, desligados; a aplicação não muda.
- Volta a testar-se com mais incêndios de ajuste (por exemplo, toda a regra de seleção alargada a outras regiões), ou se aparecer uma forma de não acelerar os intervalos lentos.
