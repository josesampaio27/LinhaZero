# ADR 0058: Revisão do motor: direções do fogo, modelo único e correções

- Estado: aceite
- Data: 2026-10-19
- Revê a [ADR 0051](0051-dezasseis-vizinhos-no-modelo-de-rothermel.md) (estêncil), a [ADR 0057](0057-fogo-sem-combate-e-corridas-rapidas.md) (limite do vento) e retira o modelo simples

## Contexto

Uma revisão independente do motor, feita a partir do documento [O motor explicado](../o-motor-explicado.md), confirmou a física (Rothermel, elipse, fogo de copas, humidade, focos) e o emparelhamento. Encontrou também falhas que mudavam resultados.

## Decisão

1. **32 direções com setores, em vez de 16 direções exatas.**
   - **O problema:** com vento forte, o fogo é uma elipse muito alongada (até 8 vezes mais comprida do que larga). Com direções fixas, quando o vento sopra entre duas delas, a cabeça perdia até 77% da velocidade. Uma elipse fina também ardia só um terço da área teórica. Os testes antigos só verificavam vento alinhado com a grelha.
   - **A solução:**
     - Cada passo cobre agora uma parte (`SECTOR_FRACTION` = 0,6) do setor angular até às direções vizinhas. Usa a velocidade da elipse no ângulo desse setor mais próximo da cabeça.
     - Com 32 direções (acrescentam-se os passos (1,3) e (2,3)), a cabeça fica a 80–100% da velocidade teórica para qualquer ângulo do vento, e a área entre 0,8 e 1,3 da elipse.
     - Um teste varre o ângulo do vento.
   - **Custo:** cerca de 4 vezes mais cálculo. O ensemble de Guimarães a 30 m, 4 horas, passa a cerca de 0,6 s.
2. **Limite do vento original de Rothermel.**
   - O limite revisto de Andrews et al. (2013), 96,8·I_R^(1/3), é **mais** restritivo do que o original (0,9·I_R) sempre que I_R > 1116 Btu/ft²/min, o que inclui quase todos os combustíveis de Guimarães.
   - A ADR 0057 adotou-o com a justificação contrária, e estava errada.
   - Testado de novo com o motor corrigido: sem limite também não melhora.
3. **Modelo único: Rothermel.**
   - O modelo simples sai da interface, do servidor e dos cenários: ficheiros antigos sem modelo, ou com "legacy", abrem com o Rothermel.
   - No modelo simples, as linhas seguravam sempre e os ataques não perdiam efeito com a intensidade, o que fazia qualquer decisão desenhada parecer melhor do que é.
   - O código fica no motor só como referência dos testes.
4. **Ignição numa estrada.**
   - Uma ignição numa célula de estrada ou não ardível não ardia e não dava aviso. Isto acontecia em 13% das células da grelha de 100 m.
   - Agora passa para a célula ardível mais próxima (até 200 m), no motor e na interface, que avisa.
5. **A intensidade fica física.**
   - O fator de velocidade da calibração (`rosAdj` = 0,5) também cortava a intensidade e o comprimento de chama para metade, e isso tornava ataques e linhas mais eficazes do que a física diz.
   - Agora só muda a velocidade.
6. **Fogo de copas.**
   - O fator de calibração (`crownAdj`) era aplicado antes do critério de fogo ativo, e no eucaliptal o fogo de copas nunca podia ser ativo.
   - Agora o critério usa a velocidade de Cruz sem ajuste.
7. **Ensemble.**
   - O fator aleatório de velocidade por combustível tinha média 1,2: as corridas eram 20% mais rápidas do que a principal.
   - Passa a ter média 1.
8. **Calibração.**
   - **Recomeço de cada intervalo:** recomeça só da frente ativa (as células que arderam no intervalo anterior). O terreno ardido antes disso fica sem combustível. Antes, os flancos já apagados voltavam a arder, e isso empurrava a calibração para abrandar o fogo.
   - **Ponto de partida dos ajustes:** os ajustes nos fogos de teste partem dos valores físicos, e não da calibração atual, que já tinha visto alguns desses fogos.
9. **Linguagem honesta.**
   - O mapa passa a chamar-se "cenários em que arde, sem combate além do desenhado", e não "probabilidade" calibrada.
   - Os "fogos nunca usados" passam a ser descritos com rigor: os três parâmetros principais não foram ajustados neles, mas várias escolhas discretas foram feitas a olhar para eles.

## Resultados

Com o motor corrigido, a calibração atual (velocidade ×0,5, vento ×2,5, linhas que seguram com 5 comprimentos de chama, copas a 0,35) **mantém-se**. Um reajuste honesto, a partir dos valores físicos e só em fogos de teste, dá praticamente os mesmos valores (velocidade ×0,55, vento ×2,2) e não é melhor. Os ×0,5 e ×2,5 não eram um artefacto das direções.

Nos fogos de teste (5 partes):

| | Antes da revisão | Depois |
| --- | --- | --- |
| Custo no fogo livre (menor é melhor) | 1,115 | **1,041** |
| Corridas rápidas, velocidade simulada / observada | 0,59 | **0,67** |
| Sørensen desde a ignição, 32 fogos | 0,390 | 0,381 |
| Sørensen médio dos 9 fogos da CI | 0,47 | 0,41 |
| Mapa de cenários no fogo livre: células com todos os cenários que arderam de facto | 22% | **47%** |
| Brier do mapa de cenários no fogo livre | 0,070 | **0,039** |

- **O que melhora:** o motor corre mais perto da realidade quando o fogo corre livre, e as corridas rápidas melhoram, só por corrigir as direções.
- **O que desce, e porquê:** o acerto nos 9 fogos da CI baixa. Sete deles serviram para a calibração original, que tinha absorvido o artefacto. O valor antigo era em parte lisonjeiro.

## Consequências

- O motor é mais lento (cerca de 4 vezes), mas continua abaixo de um segundo por comparação no dispositivo.
- As linhas desenhadas seguram menos do que no modelo simples, porque agora dependem da chama. A ferramenta diz-o.
- Os números da validação e o documento [O motor explicado](../o-motor-explicado.md) foram atualizados.
