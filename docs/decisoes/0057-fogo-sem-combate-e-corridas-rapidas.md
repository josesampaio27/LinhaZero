# ADR 0057: Fogo sem combate por omissão, e o que se testou para as corridas rápidas

- Estado: aceite; o limite do vento revisto foi retirado pela [ADR 0058](0058-revisao-do-motor.md) (é mais restritivo, não menos)
- Data: 2026-10-19
- Substitui, em parte, a [ADR 0055](0055-incerteza-calibrada-com-incendios-reais.md): deixa de haver o mapa de recalibração

## Decisão

- **Sem combate por omissão:** o motor simula o fogo sem combate. Só há combate onde o utilizador o desenha (Ataque, Linha de contenção, Proteger zona), com as regras de intensidade da [ADR 0052](0052-intensidade-linhas-que-cedem-e-focos-secundarios.md).
- **Probabilidade:** o mapa mostra a fração das 30 corridas em que cada célula arde, "sem combate (exceto o desenhado)".
  - O mapa de recalibração da ADR 0055 foi retirado: tinha sido ajustado em fogos inteiros que foram combatidos, e por isso baixava a probabilidade com um combate que ninguém desenhou.
  - As perturbações (vento ±30° e ±37%, humidade ±4 pontos, velocidade por combustível, ignição até 400 m) ficam. Foram escolhidas de novo onde o fogo real menos foi travado: intervalos livres e primeira observação desde a ignição. Nos fogos de teste, o Brier aí desce de 0,076 para 0,070 e a cobertura sobe de 63% para 81%.
- **Limite do vento:** passa a ser o revisto por Andrews, Cruz e Rothermel (2013), 96,8 · I_R^(1/3) ft/min, em vez do de Rothermel (0,9 · I_R). No `PT_CALIBRATION`, é `windLimit` 2.
- **Rajadas:** o motor aceita a rajada em cada hora do tempo (`gustMs`, parâmetro `gustShare`), e os casos de validação têm as rajadas do ERA5. Não foi adotada: `gustShare` fica 0.

## Porquê

- **Regra do produto:** a ferramenta compara decisões de combate. O combate tem de ser só o que se desenha, senão um "Ataque" conta duas vezes.
- **Corridas rápidas:** nos 84 intervalos medidos acima de 15 m/min, o motor faz cerca de 0,6 da velocidade observada. Testou-se, nos fogos de teste (5 partes):

  | Mudança | Custo nos intervalos livres | Sørensen na 1.ª observação | Rápidas (simulada / observada) | Decisão |
  | --- | --- | --- | --- | --- |
  | Calibração atual | 1,115 | 0,339 | 0,59 | — |
  | Recalibrar só em intervalos livres | 1,118 | 0,321 | 0,70 | não: piora o início |
  | Limite do vento revisto (2013) | 1,109 | 0,338 | 0,60 | **sim** |
  | Rajadas (ajustadas, 0,53 da rajada) | 1,121 | 0,312 | 0,69 | não: piora o resto |

- **O que isto mostra:**
  - Recalibrar só no fogo livre deixa a velocidade em ×0,53. Logo, o ×0,5 da calibração não é sobretudo combate absorvido.
  - Os fogos reais pedem uma cabeça mais rápida e flancos mais lentos (mais alongados) do que o modelo dá.
  - Tudo o que acelera a cabeça acelera também os flancos e as horas calmas. O ganho nas corridas rápidas paga-se no resto.

## Consequências

- **Contra fogos inteiros reais, o motor sobrestima, e deve.** Eles foram combatidos. Mesmo no fogo livre, as células que todas as corridas queimam arderam em cerca de 22% dos casos: o ataque inicial nas primeiras horas também conta. A legenda e o resumo dizem-no.
- **Comparar decisões continua emparelhado** (corrida *k* igual em A e B).
- **As corridas rápidas continuam subestimadas** (cerca de 0,6). Os candidatos seguintes, por ordem:
  - **Forma do fogo:** a razão comprimento/largura com vento forte, com a cabeça mais rápida e os flancos mais lentos.
  - **Modelo empírico de matos:** Anderson et al. 2015, que precisa do artigo.
  - **Vento ajustado ao relevo.**
- **Casos de validação:** passam a ter as rajadas (`build_reference.py --weather-only`).

## Alternativas consideradas

- **Combate típico de fundo ligado por omissão:** rejeitada pela regra do produto.
- **Manter o mapa de recalibração:** dava probabilidades mais "certas" contra fogos combatidos, mas misturava esse combate com as decisões desenhadas.
