# ADR 0054: Calibração por intervalo, por grupo de combustível e com fogos de teste

- Estado: aceite
- Data: 2026-10-19
- Substitui a parte de calibração da [ADR 0053](0053-validacao-e-calibracao-com-o-pt-firesprd.md)

## Decisão

- **Casos:** os 80 incêndios do PT-FireSprd são casos de validação (`data-prep/build_references.py`, manifesto em `engine/test/reference/manifest.json`):
  - **tier A:** 34 fogos de 2018–2021, com o combustível do próprio ano, para ajustar e testar;
  - **tier B:** 46 fogos de 2015–2017, só para validar.
- **Pontuação por intervalo:** cada intervalo entre duas observações recomeça da área observada ardida no seu início, com o tempo desse intervalo. Só se comparam as células que arderam durante o intervalo.
  - Custo de um intervalo: (1 − Sørensen do incremento) + 0,5 × |ln(área simulada / observada)|, com o erro de crescimento limitado a ln 5.
  - Os intervalos em que o fogo corria livre pesam 1; os lentos (noite, combate) pesam 0,25.
- **Parâmetros:** a calibração pode ajustar 7 parâmetros:
  - um fator de velocidade por grupo de combustível (folhada, sub-bosque, matos, herbáceas);
  - o vento a meia chama, a largura que segura uma linha e uma correção da humidade do combustível morto.
  - O ajuste é feito por CMA-ES, com uma prior fraca para os valores físicos.
- **Incerteza:** 30 reajustes em amostras bootstrap dos fogos dão as amostras de parâmetros que o ensemble pode sortear (`EnsembleOptions.paramSamples`; a corrida *k* usa a amostra *k* mod *n*).
- **Regra de adoção:** só se adota uma calibração nova se, nos fogos que nenhuma das duas viu, for melhor do que a atual no custo por intervalo **e** no Sørensen desde a ignição.
- **Resultado desta vez:** a calibração por grupo empata com a atual (Sørensen 0,376 contra 0,377 em 26 fogos de teste) e não é adotada. Fica `PT_CALIBRATION` (agora em `engine/src/calibration.ts`), sem amostras. O relatório está em `engine/src/calibration-reports/pt-firesprd-2026-10-19.json`.

## Porquê

- **Erros que não se acumulam:** pontuado desde a ignição, um erro cedo estraga todas as observações seguintes. Por intervalo, mede-se a velocidade e a direção onde acontecem, como na assimilação de perímetros.
- **Não ajustar a física ao combate:** os intervalos lentos são sobretudo noites e fogos travados pelos meios. Com peso baixo, o ajuste não aprende a abrandar o fogo para imitar o combate, que a interface desenha à parte.
- **Fogos de teste:** com 7 parâmetros e 32 fogos é fácil sobreajustar. Só os fogos deixados de fora dizem o que esperar num fogo novo.
- **Comparação justa:** a calibração atual foi ajustada em 7 dos fogos do tier A, por isso a comparação usa os outros 26.

## Consequências

- **A calibração atual sai confirmada:** sobre 32 fogos, a calibração por grupo põe os matos em ×0,5–0,7, as herbáceas em ×0,3–0,6 e o vento em ×1,6–3,2 (intervalos de 90% do bootstrap). A folhada e o sub-bosque ficam perto de 1. Os três números da ADR 0053 estavam no sítio certo para os combustíveis que mais ardem.
- **Ensemble:** o motor, a interface e o servidor já aceitam amostras de calibração. Com a calibração atual a lista está vazia; uma calibração futura que passe a regra traz as suas amostras sem mudar código.
- **Reprodutível:** `npm run calibrate -w engine` refaz tudo a partir da cache (cerca de 70 minutos em 8 núcleos).

## Alternativas consideradas

- **Adotar a calibração por grupo, porque é ligeiramente melhor por intervalo:** rejeitada. O ganho (1,140 contra 1,157) está dentro do ruído entre partições, e o Sørensen e o Brier não melhoram.
- **Pontuar só desde a ignição, como na ADR 0053:** mistura erros de velocidade com o combate e com erros iniciais.
- **Calibração bayesiana (ABC) completa:** mais cara, e o bootstrap já dá a dispersão entre fogos, que é a incerteza que importa ao ensemble.
