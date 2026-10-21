# Modelo de propagação

Como o motor calcula onde e quando o fogo chega, como entram as intervenções, e como o modelo vai evoluir.

## Hoje (feito)

O território é uma grelha de células quadradas: 100 m na grelha de Guimarães e 30 m em `guimaraes-30m`. O motor calcula o **tempo mínimo de chegada** do fogo a cada célula com o algoritmo de Dijkstra, a partir da ignição (ou de várias, por exemplo uma área já ardida).

- **Modelo de Rothermel (o único da aplicação):** passa em 32 direções. Cada direção representa também 0,6 do setor angular à sua volta, para a velocidade da cabeça não depender do ângulo entre o vento e a grelha ([ADR 0058](../decisoes/0058-revisao-do-motor.md)).
- **Tempo de cada passo:** a soma, por cada célula que o passo atravessa (a de partida incluída), do comprimento nessa célula a dividir pela velocidade dela nessa direção (`engine/src/spread-rothermel.ts`).
- **Tempo que muda:** quando o tempo meteorológico muda, ou quando começa um "Ataque" ou um "Proteger zona", os passos em curso recalculam-se. Guardam a parte já percorrida e fazem o resto à velocidade nova ([ADR 0063](../decisoes/0063-tempo-que-muda-cantos-e-estado-de-partida.md)). Assim, um fogo que começa em calmaria acelera quando o vento sobe, e o resultado não depende do tamanho da célula.
- **Barreiras:** um passo não salta uma barreira de uma célula, nem se esgueira pelo canto entre duas barreiras diagonais.
- **Área já ardida:** as células cujo centro está dentro do perímetro contam como ardidas, com o fogo já a 0,65 do caminho até à borda delas.
- **Duração:** o cálculo para quando o tempo passa a duração pedida (por exemplo 4 horas); células não alcançadas ficam com tempo infinito.
- **Precisão:** o Dijkstra trabalha em Float64 e só converte para Float32 no resultado ([ADR 0006](../decisoes/0006-precisao-dos-tempos.md)).

### Modelo de Rothermel

A velocidade vem do modelo de Rothermel (1972), tal como o BehavePlus o calcula (`engine/src/rothermel.ts`, [ADR 0048](../decisoes/0048-rothermel-com-elipse-ao-lado-do-modelo-legado.md)):

- **Combustível:** cargas por classe (1 h, 10 h, 100 h, herbáceo vivo, lenhoso vivo), razão superfície/volume, profundidade, humidade de extinção e poder calorífico, em `fuelTable[código].rothermel`.
  - Os 18 modelos portugueses vêm da tabela de Fernandes e Loureiro (2021), transcrita sem alterações em `data-prep/fuel_params.csv`.
  - O NFFL 4 e o NFFL 11 vêm de Anderson (1982). Os 13 modelos de Anderson também estão em `engine/src/fuel-models.ts`.
- **Erva que seca (modelos dinâmicos):** nos modelos com carga herbácea (M-H, M-F, V-MH, V-Hb, V-Ha), a erva passa de viva a morta conforme a humidade do herbáceo vivo, como no BehavePlus. Totalmente curada a 30% ou menos; totalmente verde a 120% ou mais. A tabela de 2021 não diz que estes modelos são dinâmicos, mas a Figura 1 de Fernandes et al. (2009) só se reproduz assim.
- **Verificação contra a Figura 1 de Fernandes et al. (2009):** nas condições do gráfico, os 18 modelos dão a velocidade e o calor por unidade de área do gráfico (`fuel-models-pt.test.ts`). A exceção é o V-Ha, cerca de 15% abaixo na velocidade: o modelo terá sido revisto entre 2009 e 2021.
- **Humidade:** `Scenario.moisture`, em frações. Por omissão: 6/7/8% no combustível morto, 60% no herbáceo vivo e 90% no lenhoso vivo.
  - **"Do tempo"** calcula-a com o NFDRS de 1978 (`engine/src/moisture.ts`, [ADR 0050](../decisoes/0050-humidade-do-combustivel-e-tempo-hora-a-hora-no-motor.md)). Usa a temperatura e a humidade do ar, a nebulosidade e a posição do sol.
  - O combustível vivo vem de uma tabela por mês (provisória).
- **Vento:** o vento de 10 m passa a vento a 20 pés (÷ 1,15) e depois a vento a meia altura da chama, com o fator de ajuste (WAF) do combustível.
  - Grupo V: o valor sem coberto, calculado da profundidade (0,37 a 0,47).
  - Grupos F e M, debaixo das árvores (`underCanopy`): o valor abrigado de Albini e Baughman, com o coberto arbóreo da célula (camada `canopy`, Copernicus Tree Cover Density 2018) e uma altura suposta de 12 m. A altura quase não muda o valor.
    - Abrigado a partir de cerca de 15% de coberto; abaixo disso, o valor sem coberto.
    - Sem camada ou sem dados: o valor de um povoamento com 50% de coberto (0,11).
  - Os modelos V e NFFL não são abrigados: os arbustos e as árvores jovens são o próprio combustível ([ADR 0049](../decisoes/0049-coberto-arboreo-do-copernicus-para-o-abrigo-do-vento.md)).
- **Vento e declive** somam-se como vetores. O resultado dá a velocidade e a direção da frente, com o limite de vento original de Rothermel (0,9 × intensidade de reação).
- **Forma:** elipse de Anderson (forma do BehavePlus), com a ignição no foco de trás.
- **Saídas por célula:** o tempo de chegada e a intensidade de Byram com que o fogo chega; a interface mostra-a na vista "Intensidade". O comprimento de chama deriva da intensidade.
- **Fogo de copas:** Van Wagner (1977) e Cruz et al. (2005), com a intensidade física à velocidade de Cruz ([ADR 0056](../decisoes/0056-fogo-de-copas.md), [ADR 0063](../decisoes/0063-tempo-que-muda-cantos-e-estado-de-partida.md)).

A grelha de Guimarães já tem os parâmetros (`fuelTable[código].rothermel`, de `data-prep/fuel_params.py`) e a camada de coberto (`data-prep/canopy.py`).

O modelo simples anterior (`velocidade base × exp(vento) × exp(declive)`, 8 vizinhos) foi retirado da aplicação pela [ADR 0058](../decisoes/0058-revisao-do-motor.md). Fica no motor só como referência dos testes de validação.

### Calibração com incêndios reais (Rothermel)

Na interface e no servidor, o modelo de Rothermel corre com `PT_CALIBRATION` (`engine/src/calibration.ts`), ajustada em incêndios do PT-FireSprd e confirmada em 26 fogos de teste ([Calibração e validação](calibracao-e-validacao.md), ADRs [0053](../decisoes/0053-validacao-e-calibracao-com-o-pt-firesprd.md) e [0054](../decisoes/0054-calibracao-por-intervalo-e-por-grupo.md)):

- metade da velocidade;
- vento a meia chama 2,5 vezes maior;
- linhas e estradas que só seguram a 50% com cinco comprimentos de chama de largura.
- fogo de copas nos povoamentos florestais (Van Wagner 1977 e Cruz et al. 2005, a 0,35 × a velocidade de Cruz; [ADR 0056](../decisoes/0056-fogo-de-copas.md)).

As autoestradas, as estradas e os rios cedem conforme a largura; só as superfícies de água são barreiras absolutas.

Cada resolução tem a sua calibração (`calibrationFor(cellSize)`). A grelha de 30 m usa por agora os mesmos valores (`PT_CALIBRATION_30M`). Um ajuste próprio a 30 m, a partir dos valores físicos, não passou a regra de adoção, e estes valores ganham ao modelo físico nos fogos de 30 m que nunca viram ([ADR 0064](../decisoes/0064-calibracao-da-grelha-de-30-m.md), [plano de recalibração](../plano-refit-30m.md)).

### Intensidade, linhas que cedem e focos secundários (Rothermel)

As regras estão na [ADR 0052](../decisoes/0052-intensidade-linhas-que-cedem-e-focos-secundarios.md).

- **Intensidade:** o resultado traz a intensidade de Byram em cada célula; a interface mostra-a na vista "Intensidade".
- **Ataque e Proteger zona:** perdem efeito entre 500 e 4000 kW/m.
- **Linhas de contenção e estradas:** cedem conforme a largura e o comprimento de chama. Na camada `barrier`, uma estrada guarda a sua largura em metros.
- **Focos secundários:** no ensemble, as faúlhas caem a uma distância de Sardoy (2008) e saltam barreiras e linhas; numa linha de contenção já pronta, apagam-se.

### Tempo que muda durante o fogo

`Scenario.weatherSteps` dá o vento (e, no Rothermel, a humidade do combustível) a partir de cada minuto.

- O passo de uma célula usa o tempo no minuto em que o fogo parte dela.
- O Dijkstra aplica cada mudança quando o relógio da pesquisa a passa, e recalcula nesse minuto os passos ainda em curso, com a parte já percorrida guardada ([ADR 0063](../decisoes/0063-tempo-que-muda-cantos-e-estado-de-partida.md)).
- Na interface, "Seguir a previsão hora a hora" cria um passo por hora da previsão do Open-Meteo. O primeiro passo usa o vento dos controlos.

### Intervenções

| Intervenção | Efeito | Desenho |
| --- | --- | --- |
| Linha de contenção | A partir do minuto de início, o fogo não entra nas células da linha | Linha, rasterizada 4-conexa para o fogo não passar na diagonal ([ADR 0003](../decisoes/0003-rasterizacao-de-linhas.md)) |
| Ataque | A partir do minuto de início, a velocidade na zona multiplica-se por 0,2 | Polígono |
| Proteger zona | A partir do minuto de início, a velocidade na zona multiplica-se por 0,1 ([ADR 0012](../decisoes/0012-logica-do-proteger-zona.md)) | Polígono |

- **Quando conta:** um abrandamento conta se estiver ativo no minuto em que o fogo parte da célula; uma contenção conta se estiver ativa no minuto em que o fogo chegaria ([ADR 0005](../decisoes/0005-momento-em-que-se-avalia-uma-intervencao.md)).
- **Sobreposições:** numa célula com várias intervenções, ganha a contenção mais cedo e o abrandamento mais forte ([ADR 0004](../decisoes/0004-intervencoes-sobrepostas.md)).

### Métricas

Para cada decisão (`engine/src/metrics.ts`): hectares ardidos ao fim de cada hora, edifícios em células que ardem dentro da duração ([ADR 0018](../decisoes/0018-edificios-em-celulas-nao-combustiveis.md)), e o primeiro minuto de chegada a cada lugar.

O motor é uma **função pura**: `simulate(grid, scenario) → result`. Não chama APIs, não lê ficheiros por conta própria e não sabe nada de mapas.

## Evolução (planeado)

Mantemos a formulação de **tempo de chegada sobre grafo**. É rápida, determinística, explicável (há caminhos críticos) e lida naturalmente com intervenções dependentes do tempo. Melhoramo-la em várias frentes:

| Limitação no protótipo | Evolução |
| --- | --- |
| 32 direções com setores no Rothermel (feito) | Um solver eikonal anisotrópico (fast marching ordenado), se as formas o pedirem |
| `baseRate × exp(...)` empírico | **Rothermel (1972)** com os parâmetros dos modelos portugueses (Fernandes et al.; legenda FUMOD), com efeitos de vento e declive na forma de Rothermel e Albini |
| Forma da propagação implícita | **Elipse de Anderson**: a razão comprimento/largura depende do vento efetivo. A velocidade numa direção θ obtém-se a partir da elipse, o que dá velocidades realistas nos flancos e na retaguarda |
| Vento uniforme no espaço | **Campo de vento no relevo** (solver consistente em massa, ao estilo WindNinja, escrito por nós). A variação horária já está feita: passos de tempo, [ADR 0050](../decisoes/0050-humidade-do-combustivel-e-tempo-hora-a-hora-no-motor.md) |
| Humidade do combustível morto sem histórico (NFDRS 1978) | **FFMC** do sistema FWI (Van Wagner) ou modelo de Nelson, quando houver histórico diário; combustível vivo por satélite em vez da tabela por mês |
| Probabilidade de rutura com coeficientes provisórios (feito no Rothermel) | Calibrar os coeficientes com incêndios reais; largura das estradas medida em vez da classe do OSM |
| Focos secundários de curto alcance (Sardoy, feito no ensemble) | Faúlhas de longo alcance (casca de eucalipto, quilómetros) e fogo de copas, com dados de copas |

Com o tempo meteorológico como entrada, a função passa a `simulate(grid, weather, scenario, seed) → result`, e continua pura.

### Explicação do resultado (planeado)

O Dijkstra pode guardar o predecessor de cada célula. Daí obtém-se o **caminho crítico do fogo até cada aldeia** e a decomposição da velocidade em fatores (combustível × vento × declive × humidade): *"o fogo chega à escola por este vale; 60% da velocidade deve-se ao vento"*.

### Intervenções e meios (planeado)

```text
Intervention {
  kind: containmentLine | directAttack | protectZone | aerialDrop | roadClosure (não afeta o fogo, só métricas)
  geometry, resourceId?
  requestedStart
}
Resource {
  type: brigada apeada | VLCI/VFCI | máquina de rasto | meio aéreo
  base (posição), velocidade na rede viária, ritmo de construção (m/min por tipo de combustível e declive)
}
effectiveStart(segmento) = max(requestedStart, partida + deslocação(rede OSM) + construção acumulada até ao segmento)
```

A linha constrói-se **por segmentos ao longo do tempo**. Se o fogo chega a um segmento antes de ele estar pronto, o segmento falha e a interface assinala-o a vermelho. Os tempos de deslocação estimam-se pela rede viária do OSM, com uma velocidade média por tipo de via. Um motor de rotas dedicado (OSRM) só entra se esta estimativa se mostrar grosseira.

### Sugerir um terceiro caminho (planeado)

Uma linha de contenção é, em grafo, um corte entre a ignição e os ativos a proteger. Um corte mínimo ponderado (pelo custo de construção e pela viabilidade temporal) sobre o grafo de tempos de chegada é uma forma de propor uma terceira decisão. A primeira versão, na semana do hackathon, será uma pesquisa local de linhas candidatas perpendiculares ao caminho crítico, avaliadas pelo motor.
