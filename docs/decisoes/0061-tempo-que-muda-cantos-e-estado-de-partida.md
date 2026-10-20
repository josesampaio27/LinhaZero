# ADR 0061: Passos que se recalculam quando o tempo muda, cantos, intensidade das copas e estado de partida

- Estado: aceite
- Data: 2026-10-20
- Completa a [ADR 0058](0058-revisao-do-motor.md); prepara a calibração da grelha de 30 m ([ADR 0062](0062-calibracao-da-grelha-de-30-m.md))

## Contexto

Uma auditoria do motor, feita antes de calibrar a grelha de 30 m, encontrou falhas que mudavam os resultados, umas mais na grelha de 100 m, outras em qualquer grelha.

## Decisão

1. **Os passos em curso recalculam-se quando o tempo muda.**
   - **O problema:** o tempo de um passo era fixado com o tempo meteorológico do minuto em que o fogo saía da célula, e nunca mais revisto. Um fogo que começava em calmaria ficava parado: a 100 m, com calma nas primeiras 2 horas e 8 m/s depois, ardia 1 ha em 4 horas, contra 331 ha a 30 m e a 15 m. Os passos lançados numa tarde seca também não abrandavam com a humidade da noite, e um fogo apagado pela humidade não reacendia de manhã.
   - **A solução** (`engine/src/spread-rothermel.ts`): quando o tempo muda, ou quando começa um "Ataque" ou um "Proteger zona", as chegadas ainda não alcançadas esquecem-se. Cada célula a arder com vizinhos por arder recomeça os seus passos nesse minuto. Guarda a parte do passo já percorrida nas condições antigas e faz o resto à velocidade nova.
   - **Testes** (`engine/test/changing-conditions.test.ts`):
     - a calmaria seguida de vento, e o tempo seco seguido de húmido, ardem o mesmo a 100, 50 e 30 m (diferença abaixo de 12% e de 10%);
     - o fogo apagado pela humidade reacende;
     - repetir o mesmo tempo não muda nada;
     - um ataque que começa a meio de um passo abranda o resto desse passo.
2. **Cantos.** Um passo que passa exatamente pelo canto entre duas células (os passos diagonais e os seus múltiplos) já não se esgueira entre duas barreiras que seguram. Uma linha de água desenhada só com células diagonais deixava passar o fogo.
3. **Intensidade do fogo de copas.** A intensidade numa célula com fogo de copas passa a ser a física: a velocidade de Cruz vezes o calor da superfície e das copas. O fator de calibração `crownAdj` só muda a velocidade, tal como o `rosAdj` desde a ADR 0058. Antes, a parte da superfície contava a dobrar e a das copas a 0,35.
4. **Ponto de ignição sorteado.** Quando o ponto sorteado cai numa estrada ou noutra célula que não arde, passa para a célula ardível mais próxima (até 200 m), como o ponto dado. Antes voltava ao ponto dado, e um terço das corridas partia exatamente daí.
5. **Faúlhas e linhas.** Uma faúlha que cai numa linha de contenção já pronta apaga-se: a linha é terra limpa.
6. **Estado de partida igual ao observado.**
   - **O que se mede:** um incêndio observado conta como ardida uma célula cujo centro está dentro do perímetro.
   - **O que mudou:** a simulação passa a partir exatamente dessas células, na ignição e no recomeço de cada intervalo. Antes, a zona de ignição era traçada com as células tocadas pelo contorno, o que a aumentava.
   - **Células já ardidas** (`Ignition.burned`): o fogo já percorreu parte do caminho até à borda dessas células (`SEED_SHARE` = 0,65). Partir do centro perdia meia célula a cada recomeço, até um terço do crescimento de um intervalo a 30 m com pouco vento. Partir da borda creditava a mesma vantagem a toda a frente, e o caminho mais rápido passava à frente.
   - **Como se escolheu o 0,65:** em fogos do próprio motor, observados a cada 30–120 minutos e recomeçados do que se observou, o crescimento de cada intervalo fica a 1,00 da média (0,85–1,06 por intervalo) a 30 m, com vento de 1 a 10 m/s. São fogos sintéticos, não incêndios reais: a escolha não toca nos fogos da calibração.
7. **Limiares em hectares.** Na pontuação por intervalo, o mínimo de área nova (5 ha) e a suavização do erro de crescimento (+1 ha) passam a ser em hectares, e não em células. Os mesmos intervalos contam a qualquer resolução.
8. **Duas opções para hipóteses**, desligadas por omissão:
   - `crownRatio`: a razão de copa no abrigo do vento, como no BehavePlus;
   - `demSmoothM`: a suavização do relevo antes do declive. O Copernicus GLO-30 é um modelo de superfície, com as bordas das árvores e dos edifícios.

## Consequências

- **A grelha de 100 m muda.** Os fogos de calmaria e as noites deixam de ficar presos, e os valores de referência dos 9 incêndios da CI foram registados de novo.
- **A calibração de 100 m (`PT_CALIBRATION`) não foi refeita**, e absorvia parte destas falhas. A grelha de 30 m é calibrada à parte, na ADR 0062.
- **O custo** de um passo recalculado é pequeno: só a frente ativa recomeça, uma vez por hora de tempo.
- **Ficou de fora:** a contagem de edifícios em células que não ardem (ADR 0018) é uma decisão de produto, não de física.
