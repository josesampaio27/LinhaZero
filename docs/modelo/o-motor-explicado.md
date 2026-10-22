# O motor de propagação do fogo, explicado

Este documento explica, sem pressupor formação técnica, como funciona o motor que simula incêndios rurais na grelha de Guimarães:

- o que o motor faz;
- como representa o território;
- como calcula o avanço do fogo;
- que parâmetros usa e de onde vêm;
- como foi posto à prova contra incêndios reais;
- o que ainda não sabe fazer.

É escrito para o júri, os mentores e a comunidade científica. Os detalhes de implementação estão no código (`engine/`) e nas decisões de arquitetura (`docs/decisoes/`).

---

## 1. Para que serve

A ferramenta responde a uma pergunta de quem coordena um incêndio rural nas primeiras horas:

> **"Se eu tomar a decisão A ou a decisão B, o que acontece ao fogo nas próximas horas?"**

- **O que o utilizador faz:**
  - marca onde o fogo começou (ou a área que já ardeu);
  - indica o tempo (vento, temperatura, humidade, ou a previsão hora a hora);
  - desenha duas decisões: por exemplo, uma linha de contenção num sítio ou num outro, ou um ataque a um flanco.
- **O que o motor faz:** simula as duas e compara:
  - a área ardida hora a hora;
  - os edifícios atingidos;
  - quando o fogo chega a cada lugar;
  - em quantos cenários de tempo uma decisão é melhor do que a outra.

**O motor não é um oráculo.** Dá uma estimativa física e honesta sobre a sua incerteza, para ajudar a comparar opções, não para prever o perímetro ao metro.

### Em resumo

| | |
| --- | --- |
| Território | Concelho de Guimarães e arredores, 239 km², em células de 100 m (ou 30 m) |
| Física | Modelo de Rothermel (1972), com os modelos de combustível portugueses, fogo de copas e focos secundários |
| Tempo | Vento, temperatura e humidade hora a hora; humidade do combustível calculada a partir deles |
| Combate | Só o que o utilizador desenha; sem nada desenhado, o fogo não é combatido |
| Incerteza | De 200 a 500 simulações por decisão, no servidor, com vento, humidade, combustível e ponto de ignição a variar |
| Validação | 80 incêndios reais portugueses (PT-FireSprd, 2015–2021); regra de adoção em fogos não usados no ajuste |
| Velocidade | Uma decisão com 500 simulações na grelha de 100 m: cerca de 0,2 s num portátil; na grelha de 30 m, com 8 h de fogo, cerca de 43 s (medido a 22 de outubro de 2026) |

---

## 2. O território: a grelha de Guimarães

O motor não vê um mapa como nós: vê uma **grelha de quadrados**, as células. Cada célula guarda o que importa para o fogo.

### Extensão e resolução

| | Grelha de 100 m | Grelha de 30 m |
| --- | --- | --- |
| Células | 157 × 152 = 23 864 | 520 × 503 = 261 560 |
| Área de cada célula | 1 hectare | 0,09 hectares |
| Área total | cerca de 239 km² | a mesma |
| Uso | Interface, por omissão | Mais pormenor (estradas e faixas estreitas), cerca de 8 vezes mais cálculo |

- **Coordenadas:** sistema português PT-TM06 (EPSG:3763).
- **Zona:** cerca de 8,38° a 8,20° W e 41,38° a 41,52° N, a cidade de Guimarães e as freguesias à volta.
- **Relevo:** a altitude vai de 85 m a 602 m (serra da Penha e encostas a nascente).

### O que cada célula guarda

| Camada | O que é | Fonte |
| --- | --- | --- |
| **Combustível** | O tipo de vegetação que arde (modelo de combustível) | Mapa FUMOD de modelos de combustível para Portugal (100 m) |
| **Altitude** | Para calcular o declive e para que lado a encosta sobe | Copernicus DEM GLO-30 (30 m) |
| **Barreiras** | Água (barreira absoluta) e estradas e rios, com a largura em metros | OpenStreetMap |
| **Edifícios** | Número de edifícios na célula | OpenStreetMap |
| **Lugar** | A aldeia ou lugar mais próximo (até 1 km), para dizer "o fogo chega a X às 15h20" | OpenStreetMap |
| **Coberto arbóreo** | Percentagem da célula coberta por copas de árvores | Copernicus Tree Cover Density 2018 (10 m) |

A grelha de Guimarães tem cerca de 12 000 edifícios em 3 200 células, 88 lugares com nome e um coberto arbóreo médio de 25%.

### Os combustíveis

O fogo depende sobretudo do que arde. O mapa FUMOD classifica cada hectare num **modelo de combustível**, uma descrição padronizada da vegetação: quanto material há, de que tamanho, a que altura, quão inflamável. Os modelos são os definidos para Portugal por Fernandes e Loureiro (2021).

| Combustível em Guimarães | Área | Grupo |
| --- | --- | --- |
| Não combustível (áreas urbanas, agrícolas regadas, rocha) | 27,5% | — |
| Mato sob eucaliptal (M-EUC) | 25,1% | Sub-bosque |
| Herbáceo alto (V-Ha) | 20,2% | Herbáceas |
| Mato sob folhosas caducifólias (M-CAD) | 9,0% | Sub-bosque |
| Mato e herbáceas (V-MH) | 8,0% | Herbáceas |
| Mato atlântico alto (V-MAa) | 6,1% | Matos |
| Mato atlântico baixo (V-MAb) | 1,5% | Matos |
| Mato mediterrâneo baixo (V-MMb) | 1,0% | Matos |
| Mato sob pinhal (M-PIN) | 1,0% | Sub-bosque |
| Outros (folhada de eucalipto, regeneração de pinheiro, resíduos) | 0,6% | Folhada, matos |

Os modelos dividem-se em quatro grupos, que o motor trata de forma diferente:

- **Folhada (F):** a folhada no chão da floresta.
- **Sub-bosque (M):** o mato debaixo das árvores.
- **Matos (V):** o mato a céu aberto.
- **Herbáceas (H):** a erva, que seca no verão.

Debaixo das árvores o vento é mais fraco (abrigo), e a erva passa de verde a seca conforme a sua humidade.

Cada modelo traz os números de que a física precisa:

- carga de combustível por tamanho (folhas e raminhos finos, ramos, troncos, erva viva, arbustos vivos);
- superfície por volume das partículas;
- profundidade do leito;
- poder calorífico;
- humidade a partir da qual deixa de arder.

Estão em `data-prep/fuel_params.csv`, transcritos das tabelas publicadas.

### Barreiras que cedem

Uma estrada ou um rio não para sempre um fogo: depende da largura e de quão alta é a chama. Cada linha guarda a sua largura:

| Elemento | Largura |
| --- | --- |
| Autoestrada | 30 m |
| Via rápida | 20 m |
| Estrada nacional | 10 m |
| Estrada regional | 7 m |
| Rio | 15 m |
| Canal | 6 m |

Só as superfícies de água (lagos, albufeiras) são barreiras absolutas. A secção 4 explica como o motor decide se o fogo passa.

---

## 3. Como o fogo avança

### A ideia central: o tempo de chegada

O motor calcula, para cada célula, **a que horas o fogo lá chega**. Pense-se num mapa de estradas em que cada troço demora um certo tempo a percorrer. O caminho mais rápido de casa a qualquer sítio é o que o fogo faz, e o "tempo de percurso" de cada troço é o tempo que o fogo demora a atravessar aquele pedaço de terreno naquela direção.

- **Cálculo:** é feito com o algoritmo de Dijkstra, o mesmo que os GPS usam para o caminho mais curto. É exato, rápido e sempre dá o mesmo resultado para os mesmos dados.
- **Direções:** de cada célula, o fogo pode seguir em 32 direções: as 8 vizinhas, as 8 em "salto de cavalo" e mais 16 passos um pouco mais longos.
  - **O problema das direções fixas:** com vento forte, o fogo é uma elipse até 8 vezes mais comprida do que larga. Se o vento sopra entre duas direções da grelha, a cabeça teria de avançar em zig-zag e perderia até três quartos da velocidade.
  - **A solução:** cada direção representa também parte do ângulo à sua volta, e usa a velocidade da elipse nesse ângulo mais próximo da cabeça.
  - **O resultado:** para qualquer direção do vento, a cabeça fica a 80–100% da velocidade teórica e a área entre 0,8 e 1,3 da elipse. Há um teste automático que varre o ângulo do vento.
- **Células atravessadas:** quando um passo atravessa duas células (por exemplo, meio mato e meio campo), o tempo é repartido por elas.

### A velocidade do fogo: o modelo de Rothermel

A velocidade em cada célula e em cada direção vem do **modelo de Rothermel (1972)**. É o modelo de fogo de superfície mais usado no mundo (BehavePlus, FARSITE, FlamMap e outros sistemas usados nos EUA e na Europa, incluindo em Portugal). Em termos simples:

- **O que o modelo calcula:** o fogo avança quando o calor que liberta chega para aquecer e secar o combustível à frente até ele arder.
- **O que acelera o fogo:**
  - **mais combustível fino e seco;**
  - **vento:** inclina a chama para a frente, que aquece mais o combustível por arder;
  - **declive:** a subir, a chama fica mais perto do combustível da encosta.
- **O que o abranda:**
  - **humidade:** a água tem de evaporar antes de o combustível arder; acima de uma certa humidade, o fogo não se propaga;
  - **erva verde:** combustível vivo húmido absorve calor.

O motor implementa o modelo tal como o BehavePlus, a referência do Serviço Florestal dos EUA. Os testes reproduzem o BehavePlus com menos de 1% de diferença.

### Vento, declive e forma do fogo

- **Vento à altura da chama:** o vento medido a 10 m é convertido para o vento à altura da chama.
  - **A céu aberto,** a conversão depende da altura do mato.
  - **Debaixo de árvores,** o vento é muito mais fraco. O motor usa o coberto arbóreo de cada célula: um eucaliptal com 50% de coberto deixa passar cerca de um décimo do vento.
- **Vento e declive** somam-se como setas. O resultado dá a direção e a velocidade da cabeça do fogo.
- **Limite do vento:** com vento muito forte, o efeito do vento deixa de crescer indefinidamente. O motor usa o limite original de Rothermel (0,9 × intensidade de reação). O limite revisto por Andrews, Cruz e Rothermel (2013) é mais restritivo nos combustíveis de Guimarães, e retirar o limite também não melhorou o acerto nos fogos reais.
- **Forma:** o fogo cresce como uma **elipse**, alongada na direção do vento. Quanto mais vento, mais alongada (até 8 vezes mais comprida do que larga). A cabeça corre mais, os flancos menos, a retaguarda quase nada.

### A humidade do combustível vem do tempo

- **Combustível morto:** folhas secas, raminhos e ramos. A sua humidade é calculada a cada hora a partir da temperatura, da humidade do ar, da nebulosidade e da posição do sol, pelo método do sistema americano de perigo de incêndio (NFDRS, 1978).
  - **Numa tarde quente e seca**, os raminhos finos podem descer a 3–5% de humidade.
  - **De noite,** voltam a subir, e é por isso que os fogos abrandam.
- **Combustível vivo:** erva e arbustos verdes. A humidade vem de uma tabela por mês, típica do noroeste português:
  - a erva fica seca em agosto e setembro (30%);
  - os arbustos descem a cerca de 80%.
- **Tempo que muda:** com "Seguir a previsão", o vento e a humidade mudam a cada hora durante a simulação. O fogo usa o tempo do momento em que passa em cada sítio.

### Fogo de copas

- **Quando sobe às copas:** num pinhal ou eucaliptal, se o fogo de superfície for intenso o suficiente, sobe às copas. O limiar é o critério de Van Wagner (1977), que depende da altura a que começam as copas.
- **Velocidade nas copas:** passa a correr à velocidade do modelo de Cruz et al. (2005), que depende do vento, da densidade das copas e da secura do combustível fino.
- **Fogo passivo e ativo:** pode ser passivo (árvores isoladas a arder) ou ativo (as copas ardem em contínuo).
- **Onde se aplica:** só em células com pelo menos 30% de coberto arbóreo e em combustíveis florestais.

### Focos secundários

Fogos intensos (acima de 2000 kW/m) lançam faúlhas que podem acender focos à frente, mesmo do outro lado de uma estrada ou de um rio.

- **Distâncias:** seguem o modelo de Sardoy et al. (2008), o mesmo do simulador ELMFIRE.
- **Onde existem:** só nas simulações com incerteza, porque são um fenómeno aleatório.

---

## 4. As decisões: o combate desenhado

**Sem nada desenhado, o fogo não é combatido.** Só há combate onde o utilizador o põe. Assim, a diferença entre a decisão A e a B mede só o efeito do que se desenhou.

| Ação | O que representa | O que o simulador faz |
| --- | --- | --- |
| **Linha de contenção** | Uma faixa sem combustível que os meios abrem à frente do fogo, à mão ou com máquinas, ou uma faixa de gestão que já existe. Desenha-se como uma linha (por omissão com 4 m de largura) | A partir do minuto em que fica pronta, o fogo para nela, se a faixa for larga o bastante para as chamas. Uma linha de 4 m só trava fogo fraco |
| **Ataque** | Meios a combater o fogo diretamente, com água, ferramentas ou máquinas, na cabeça ou num flanco. Desenha-se a zona onde trabalham | A partir do minuto em que os meios chegam, o fogo nessa zona anda 5 vezes mais devagar (20% da velocidade). Atrasa o fogo, não o apaga |
| **Proteger zona** | Meios já colocados junto a casas ou a uma aldeia, à espera do fogo para o travar ali. Desenha-se a zona à volta do que se defende | A partir do minuto em que lá estão, o fogo nessa zona anda 10 vezes mais devagar (10% da velocidade): mais do que num ataque, porque os meios estão no sítio e preparados |
| **Descarga aérea** | Um helicóptero ou um avião larga água ou retardante numa faixa, à frente ou no flanco do fogo. Desenha-se o percurso da descarga | Do minuto da descarga até deixar de fazer efeito (água cerca de 20 min, retardante cerca de 2 h, valores provisórios que se podem mudar), a faixa trava o fogo conforme a intensidade (abaixo) |
| **Contrafogo** | Os meios queimam de propósito o combustível entre uma linha de apoio (estrada, caminho ou linha aberta) e o fogo que se aproxima. Desenha-se a linha de apoio | No minuto indicado, acende o lado da linha virado para a ignição. Esse fogo arde como qualquer outro e conta como área ardida; a linha segura-o como uma linha de contenção, se for larga o bastante para as chamas |

Todas as ações podem ter um minuto de fim: a partir daí deixam de atuar.

As ações dependem da **intensidade do fogo**, como na realidade:

- **Ataques e zonas protegidas:** têm efeito total até 500 kW/m, chamas de cerca de 1,4 m (o fogo que uma equipa com ferramentas manuais controla). Perdem efeito até 4000 kW/m, chamas de cerca de 3,5 m, a partir do qual nenhum meio terrestre consegue atuar.
- **Descargas aéreas:** travam sempre o fogo até 2000 kW/m (chamas de cerca de 2,5 m), nunca acima de 4000 kW/m (cerca de 3,5 m), e umas vezes sim, outras não, entre os dois. Estes limites são **provisórios**.
- **Linhas e estradas:** seguram ou cedem conforme a largura e o comprimento da chama.
  - Uma linha com a largura de 5 comprimentos de chama segura em metade dos casos; mais estreita, cede quase sempre; mais larga, quase nunca. Assim, uma linha de 4 m só trava chamas até 80 cm, e uma faixa de 25 m trava chamas até 5 m.
  - O valor de 5 foi ajustado nos incêndios reais. As faixas são galgadas pelo calor radiante e pelas faúlhas muito antes de a chama ter a largura delas.
- **Quando contam:** uma ação só conta se estiver ativa quando o fogo lá chega. Uma linha que fica pronta depois de o fogo passar não serve para nada.

---

## 5. A incerteza: de 200 a 500 simulações em vez de uma

O tempo previsto nunca é exato, a humidade do combustível varia de sítio para sítio e o ponto de ignição nem sempre é conhecido. Por isso, com "Considerar a incerteza" ligada, o motor corre **de 200 a 500 simulações** de cada decisão, no servidor; o número escolhe-se numa barra na aplicação ([ADR 0070](../decisoes/0070-incerteza-sempre-no-servidor.md)). Sem o servidor, a incerteza fica desligada. Em cada simulação sorteia:

| O que varia | Quanto |
| --- | --- |
| Direção do vento | ±30° |
| Velocidade do vento | ±37% |
| Humidade do combustível morto | ±4 pontos percentuais |
| Velocidade de cada grupo de combustível | fator aleatório (desvio de 0,6 em escala logarítmica) |
| Ponto de ignição | até 400 m de distância (não quando se desenha a área já ardida) |

- **O mapa de cenários** mostra, em cada célula, em quantas das simulações ela arde, **sem combate além do desenhado**. Não é uma probabilidade calibrada de que a célula arda na realidade: os incêndios reais são combatidos, e o mapa arde mais do que eles (secção 7.4).
- **A comparação é emparelhada:** a simulação nº 7 da decisão A tem exatamente o mesmo vento, humidade e ignição da simulação nº 7 da decisão B. Assim, a diferença entre as duas é só o efeito da decisão, não o acaso.
  - O painel diz em quantos dos cenários a decisão B queima menos, e a diferença típica.
  - Duas decisões iguais dão sempre só empates.
- **Os valores desta tabela** foram escolhidos por comparação com incêndios reais, dentro de limites fisicamente plausíveis. A melhor escolha ficou no limite máximo testado, por isso são o teto do que se considerou plausível, não um valor estimado com precisão (secção 7.4).

---

## 6. Todos os parâmetros

Os valores usados na interface e no servidor estão em `engine/src/calibration.ts` e `engine/src/params.ts`. No Editor de grelha, uma "variante" pode alterar qualquer um, para experimentar.

### Parâmetros ajustados aos incêndios reais

| Parâmetro | Valor usado | Valor físico | O que faz | Porquê este valor |
| --- | --- | --- | --- | --- |
| `rosAdj` | 0,5 | 1 | Multiplica a velocidade de todos os combustíveis. Não muda a intensidade nem o comprimento de chama, que ficam físicos | Ajustado em incêndios reais. Um reajuste a partir dos valores físicos, só em fogos de teste, dá 0,55. |
| `windAdj` | 2,5 | 1 | Multiplica o vento à altura da chama | O reajuste a partir do valor físico dá 2,2. Junta o vento local mais forte do que o médio da reanálise e a forma mais alongada que os fogos reais pedem. |
| `holdWidthPerFlame` | 5 | 1 | Largura, em comprimentos de chama, com que uma linha segura em metade dos casos | O incêndio de Alijó (2019) atravessou a A4 e um rio. |
| `crownFire` | ligado | — | Fogo de copas nos povoamentos florestais | Melhora um pouco o acerto em fogos não usados no ajuste. |
| `crownAdj` | 0,35 | 1 | Multiplica a velocidade do fogo de copas | Escolhido por validação cruzada. |

A grelha de 30 m usa por agora os mesmos valores. Uma calibração própria a 30 m, a partir dos valores físicos, não ganhou ao modelo físico com a margem pedida, e estes valores ganham-lhe nos fogos de 30 m que nunca viram ([ADR 0064](../decisoes/0064-calibracao-da-grelha-de-30-m.md)).

O par velocidade ×0,5 e vento ×2,5 faz fogos mais alongados: a cabeça corre mais e os flancos menos. É o que os incêndios reais pedem (secção 7).

### Parâmetros das decisões e do fogo intenso

| Parâmetro | Valor | O que faz |
| --- | --- | --- |
| `suppressionFactor` | 0,2 | Velocidade no "Ataque" |
| `protectFactor` | 0,1 | Velocidade no "Proteger zona" |
| `attackFullKwM` | 500 kW/m | Até aqui, os ataques têm efeito total |
| `attackNoneKwM` | 4000 kW/m | A partir daqui, nenhum efeito |
| `lineWidthM` | 4 m | Largura de uma linha de contenção desenhada |
| `aerialFullKwM` | 2000 kW/m | Até aqui, uma descarga aérea trava sempre o fogo (**provisório**) |
| `aerialNoneKwM` | 4000 kW/m | A partir daqui, nunca trava (**provisório**) |
| Duração de uma descarga | água 20 min, retardante 120 min | Fim por omissão, que se pode mudar (**provisório**, `AERIAL_DEFAULT_MIN`) |
| `holdSteepness` | 3 | Quão abrupta é a passagem entre "segura" e "cede" |
| `spotCriticalKwM` | 2000 kW/m | Intensidade a partir da qual há faúlhas |
| `spotPerHa` | 0,1 | Probabilidade de um hectare a arder acima desse limiar lançar um foco |
| `spotDelayMin` | 2 min | Tempo até um foco começar a propagar |

### Constantes físicas fixas

| Constante | Valor | Fonte |
| --- | --- | --- |
| Vento a 6 m (20 pés) a partir do vento a 10 m | ÷ 1,15 | Turner e Lawson (1978), como no BehavePlus |
| Altura suposta das árvores, para o abrigo do vento | 12 m | Povoamento típico; o valor quase não muda o resultado |
| Alongamento máximo da elipse | 8 | Anderson (1983), como no BehavePlus |
| Direções de propagação | 32, cada uma com 0,6 do setor à sua volta | Escolhido por testes de forma (secção 3) |
| Limite do vento | 0,9 × intensidade de reação | Rothermel (1972), como no BehavePlus |
| Humidade foliar das copas | 100% | Valor de verão para pinheiros e eucaliptos |
| Coberto mínimo para fogo de copas | 30% | — |
| Altura e densidade das copas por modelo | pinhal 4 m e 0,12 kg/m³; eucaliptal 6 m e 0,07 kg/m³; resinosas 3 m e 0,15 kg/m³ | Valores típicos, **provisórios** |
| Humidade do combustível vivo por mês | erva de 150% (inverno) a 30% (agosto–setembro); arbustos de 130% a 80% | Curva típica do noroeste, **provisória** |

### Parâmetros que existem mas estão desligados

| Parâmetro | Valor | O que é |
| --- | --- | --- |
| `gustShare` | 0 | Parte da rajada somada ao vento médio. Testado nos fogos reais, não melhorou o conjunto. |
| `windLimit` | 1 (original) | O limite revisto (2013) e a ausência de limite foram testados nos fogos reais; nenhum melhorou. |
| `rosAdjLitter`, `rosAdjUnderstory`, `rosAdjShrub`, `rosAdjGrass` | 1 | Velocidade por grupo de combustível. Testado nos fogos reais, empatou com o fator único. |
| `deadMoistureOffset` | 0 | Correção da humidade do combustível morto. O ajuste deu praticamente zero. |

---

## 7. Como foi posto à prova

Um modelo de fogo só merece confiança se for comparado com fogos reais, e com honestidade.

### 7.1 A física está certa?

- **BehavePlus:** o modelo de Rothermel do motor foi comparado com o BehavePlus em 7 modelos de combustível e 7 combinações de vento e declive. A diferença é sempre inferior a 1% na velocidade, intensidade, comprimento de chama e direção.
- **Modelos portugueses:** nas condições do artigo de referência (Fernandes et al. 2009), os 18 modelos portugueses dão a velocidade e o calor publicados.
- **Testes de comportamento:** sem vento nem declive, o fogo cresce igual em todas as direções; com vento, alonga-se; a subir, acelera; com mais humidade, abranda.
- **Testes automáticos:** são cerca de 290 no motor, e correm a cada alteração do código.

### 7.2 O motor reproduz incêndios reais?

**Dados:** os **80 incêndios do PT-FireSprd** (Benali et al.), uma base de dados aberta com a progressão de grandes incêndios portugueses de 2015 a 2021. Para cada um tem os perímetros observados ao longo do tempo, de satélite e de relatórios operacionais, e a velocidade e direção medidas.

- **Os 34 fogos de 2018 a 2021** têm o mapa de combustível do próprio ano. Servem para ajustar e para testar; 32 têm observações suficientes para entrar no ajuste.
- **Os 46 fogos de 2015 a 2017** só têm um mapa de combustível de depois do fogo, em que a cicatriz já aparece. Servem só como verificação extra.

**Como se compara:** para cada incêndio, o motor:

1. parte da zona de ignição observada;
2. usa o tempo real desses dias, hora a hora: reanálise ERA5 do serviço Copernicus;
3. calcula a humidade do combustível de cada hora;
4. compara a área simulada com a área que ardeu a cada hora observada.

Para medir a velocidade sem que um erro cedo estrague o resto, cada intervalo entre duas observações também se simula à parte. O fogo recomeça da frente ativa observada, isto é, das células que estavam a arder no intervalo anterior, e o terreno já ardido antes fica sem combustível.

A medida principal é o **índice de Sørensen**: 1 é uma sobreposição perfeita, 0 é nenhuma.

**A regra de honestidade:** qualquer mudança no motor só é aceite se melhorar em **incêndios que não foram usados para a ajustar**, por validação cruzada:

- os incêndios são divididos em 5 grupos;
- ajusta-se em 4 e testa-se no 5.º, cinco vezes, sempre a partir dos valores físicos;
- também se testa deixando de fora um ano inteiro, ou toda a região Norte.

**Uma ressalva honesta:** os três parâmetros principais nunca foram ajustados nos fogos de teste. Mas várias escolhas discretas (o fogo de copas, o limite do vento, o tamanho da incerteza) foram decididas olhando para os resultados nesses mesmos fogos. O acerto nos "fogos de teste" é por isso um pouco otimista.

Várias ideias foram testadas e **rejeitadas** por esta regra:

- humidade do combustível pelo índice canadiano FFMC;
- outra reanálise meteorológica (ERA5-Land);
- velocidades diferentes por tipo de combustível;
- rajadas de vento.

### 7.3 Resultados

![Sobreposição entre simulado e observado em cada um dos 34 incêndios de 2018–2021](validacao-tier-a.png)

Sørensen médio nas horas observadas, desde a ignição observada, com o tempo hora a hora e sem combate, na grelha de 100 m, com o motor de hoje. Os valores vêm de `landing/src/data/site-data.json`, gerado por `engine/scripts/landing-data.ts` a 21 de outubro de 2026, o mesmo ficheiro de onde a página web tira os números.

| | Modelo simples | Rothermel sem ajuste | **Rothermel ajustado** |
| --- | --- | --- | --- |
| 34 incêndios de 2018–2021 | 0,27 | 0,33 | **0,40** |
| … dos quais na região Norte (8) | 0,20 | 0,27 | **0,40** |
| 27 incêndios fora do ajuste dos parâmetros principais | 0,28 | 0,33 | **0,40** |

- **Contra o modelo simples:** o Rothermel ajustado é melhor do que o modelo simples, já retirado (secção 8), em 27 dos 34 incêndios.
- **Teste de controlo:** com o vento de cada hora invertido, o acerto cai de 0,40 para 0,08. A comparação mede de facto a física, não o acaso.
- **Como ler estes números:** os incêndios reais **foram combatidos** e a simulação não. O máximo possível fica abaixo de 1, porque parte do perímetro real é obra dos bombeiros. Também as horas observadas e o mapa de combustível de 100 m são aproximados.

### 7.4 O que vale o mapa de cenários?

![Fração dos cenários em que arde contra a fração que ardeu de facto, nos fogos de teste](fiabilidade.png)

Um mapa que diz "30%" seria perfeito se, das células com 30%, arderem de facto 3 em cada 10. Isso mediu-se nos fogos de teste, onde o fogo real menos foi travado: nos intervalos em que corria livre e até à primeira observação.

- **Como se escolheu o tamanho das perturbações** (relatório `engine/reports/reliability-2026-10-19.json`, com 30 simulações por incêndio, em fogos de teste): com vento, humidade, combustível e ignição a variar, o mapa avisava 79% das células que arderam (68% só com o vento), e o erro da probabilidade (índice de Brier) descia de 0,047 para 0,039. A área com mais de metade dos cenários era 1,3 vezes a real.
- **Verificação com o motor de hoje** (`site-data.json`, 21 de outubro de 2026, 30 simulações por incêndio, 19 incêndios): Brier 0,028; o mapa avisa 70,5% das células que arderam (com pelo menos 10% das simulações).
- **O mapa arde mais do que a realidade:** das células em que todos os cenários ardem, arderam de facto 44%.
- **Na aplicação** correm de 200 a 500 simulações com os mesmos sorteios: mais simulações dão um mapa menos ruidoso, mas a verificação foi feita com 30.
- **É o esperado num fogo sem combate:** mesmo nas horas em que o fogo real corria livre, o ataque inicial já travava partes dele. Por isso a aplicação chama-lhe "cenários em que arde, sem combate além do desenhado", e não probabilidade.

### 7.5 Ver na aplicação

Os cenários **"Incêndio real: Alijó, 24 jul 2019"** e **"Incêndio real: Vieira do Minho, 10 ago 2016"** (a 16 km de Guimarães) abrem a simulação com a ignição e o tempo reais. O perímetro observado aparece por cima, à hora escolhida na barra de tempo. Onde os meios travaram o fogo real, a simulação, sem combate, vai mais longe.

---

## 8. O modelo "Simples", retirado

O primeiro protótipo usava um modelo simples:

- cada combustível tinha uma velocidade fixa;
- a velocidade multiplicava-se por um fator exponencial do vento e do declive;
- não respondia à humidade, as linhas seguravam sempre e os ataques não perdiam efeito com a intensidade.

Nos incêndios reais acertava menos (0,27 contra 0,40, secção 7.3) e fazia as decisões desenhadas parecerem melhores do que são.

**Foi retirado:** a aplicação e o servidor usam só o modelo de Rothermel. Os cenários antigos abrem com ele. O código fica no motor apenas como referência nos testes de validação.

---

## 9. O que o motor ainda não sabe fazer

- **Corridas rápidas subestimadas:** nas horas em que os fogos reais correram a mais de 15 m/min, o motor fica abaixo da velocidade observada.
  - **Porquê:** os fogos reais são mais alongados (cabeça mais rápida, flancos mais lentos) do que o modelo dá. Tudo o que acelera a cabeça acelera também o resto.
  - **Candidatos para corrigir:**
    - a forma do fogo com vento forte;
    - um modelo empírico de matos mediterrânicos;
    - vento ajustado ao relevo.
- **Vento uniforme no espaço:** o vento muda hora a hora, mas é o mesmo em toda a grelha. Os vales e as cumeadas mudam-no localmente.
- **Combustível vivo por tabela:** a humidade da erva e dos arbustos vem de uma curva típica por mês, não de medições. Num ano de seca, o fogo real pode ser mais rápido.
- **Copas com valores típicos:** a altura e a densidade das copas são valores típicos por tipo de povoamento, não medidos.
- **Faúlhas de longa distância:** a casca de eucalipto pode levar fogo a quilómetros, e o motor só tem focos a dezenas ou centenas de metros.
- **Mapa de combustível de 100 m:** o mapa FUMOD perde faixas de gestão de combustível estreitas e pequenas manchas. A grelha de 30 m ajuda nas estradas e nos rios, mas o combustível continua a vir de 100 m.
- **Estradas como células:** na grelha de 100 m, uma estrada ocupa uma célula inteira sem combustível, cerca de 10% das células. Uma ignição numa estrada passa para a célula ardível mais próxima.
- **Mapa principal e mapa de cenários:** o mapa de chegada é uma simulação sem sorteios, e por isso sem focos secundários. O mapa de cenários inclui-os.

---

## 10. Reproduzir

Tudo o que aqui se descreve é reproduzível a partir do repositório:

```bash
npm test                                                   # testes do motor, incluindo 9 incêndios reais
python data-prep/build_references.py --ptfs <PT-FireSprd>  # os 80 casos de validação (depois funciona sem rede)
npm run validate -w engine -- --set all                    # acerto por incêndio
npm run calibrate -w engine                                # ajuste e testes em fogos deixados de fora
npm run reliability -w engine                              # fiabilidade da probabilidade
```

---

## Referências

- **Albini, F.A., Baughman, R.G. (1979).** Estimating windspeeds for predicting wildland fire behavior. USDA Forest Service Research Paper INT-221.
- **Anderson, H.E. (1982).** Aids to determining fuel models for estimating fire behavior. USDA Forest Service GTR INT-122.
- **Anderson, H.E. (1983).** Predicting wind-driven wild land fire size and shape. USDA Forest Service Research Paper INT-305.
- **Andrews, P.L., Cruz, M.G., Rothermel, R.C. (2013).** Examination of the wind speed limit function in the Rothermel surface fire spread model. International Journal of Wildland Fire 22.
- **Benali, A. et al.** PT-FireSprd, base de dados da progressão de incêndios em Portugal, v0.08. Zenodo, doi:10.5281/zenodo.7495506 (CC BY 4.0).
- **Cohen, J.D., Deeming, J.E. (1985).** The National Fire-Danger Rating System: basic equations. USDA Forest Service GTR PSW-82.
- **Cruz, M.G., Alexander, M.E., Wakimoto, R.H. (2005).** Development and testing of models for predicting crown fire rate of spread in conifer forest stands. Canadian Journal of Forest Research 35: 1626–1639.
- **Fernandes, P.M. et al. (2009).** Modelos de combustível florestal para Portugal.
- **Fernandes, P.M., Loureiro, C. (2021).** Modelos de combustível florestal para Portugal: documento de referência.
- **Rothermel, R.C. (1972).** A mathematical model for predicting fire spread in wildland fuels. USDA Forest Service Research Paper INT-115.
- **Sardoy, N., Consalvi, J.L., Kaiss, A., Fernandez-Pello, A.C., Porterie, B. (2008).** Numerical study of ground-level distribution of firebrands generated by line fires. Combustion and Flame 154.
- **Van Wagner, C.E. (1977).** Conditions for the start and spread of crown fire. Canadian Journal of Forest Research 7: 23–34.
- **Dados:**
  - Copernicus DEM GLO-30;
  - Copernicus High Resolution Layer Tree Cover Density 2018;
  - ERA5 (Copernicus Climate Change Service), pelo arquivo do Open-Meteo;
  - mapa FUMOD de modelos de combustível;
  - OpenStreetMap (ODbL).
