# ADR 0052: Intensidade, linhas que cedem e focos secundários

- Estado: aceite
- Data: 2026-10-19

## Decisão

No modelo de Rothermel (o legado não muda):

- **Intensidade:** o resultado traz a intensidade de Byram (kW/m) com que o fogo chega a cada célula (`SimulationResult.intensityKwM`). A interface mostra-a em quatro classes, pelo que ainda trabalha contra o fogo, e dá o comprimento de chama ao passar o rato:
  - abaixo de 500 kW/m: meios terrestres;
  - 500 a 2000: máquinas;
  - 2000 a 4000: meios aéreos;
  - acima de 4000: fora de controlo.
- **Ataque e Proteger zona:** têm o efeito todo até 500 kW/m, perdem-no em linha reta e não têm nenhum a partir de 4000 kW/m. Conta a intensidade do fogo que os meios enfrentam, antes do abrandamento deles.
- **Linhas de contenção:** seguram com uma probabilidade que depende da largura da linha a dividir pelo comprimento de chama. A curva é logística, com 50% quando a largura é igual à chama (provisório).
  - A interface oferece larguras de 1, 4 (por omissão), 10 e 25 m.
  - A corrida principal conta a linha como segura se a probabilidade for de 50% ou mais.
  - No ensemble, cada célula tem o seu sorteio, por isso uma linha longa vale o seu troço mais fraco.
- **Estradas:** a camada `barrier` passa a distinguir barreiras (1: autoestradas, rios, água) de estradas com largura em metros (2 a 255: largura do OSM ou 10 m nas principais e 7 m nas secundárias). As estradas cedem como as linhas, e um fogo que as galga atravessa-as à velocidade da célula de origem.
  - Saltos de duas células, só por cima de uma estrada, deixam a frente do fogo enfrentá-la de caras.
  - No modelo legado, uma estrada continua a ser uma barreira.
- **Focos secundários (só no ensemble):** uma célula a arder acima de 2000 kW/m lança uma faúlha com probabilidade de 10% por hectare. A faúlha cai a favor do vento a uma distância lognormal de Sardoy et al. (2008), com os parâmetros da implementação do ELMFIRE (`elmfire_spotting.f90`). Em combustível por arder, acende ao fim de 2 minutos, sejam quais forem as barreiras ou as linhas pelo caminho.
- **Sorteios:** usam um gerador por contador (`hashRandom(seed, run, finalidade, célula)`). Assim a corrida *k* de A e a de B têm a mesma "sorte" em cada célula, e o ensemble continua emparelhado.

Todos os limiares e coeficientes estão em `ModelParams`, por isso uma variante de grelha pode mudá-los.

## Porquê

Uma linha que segura sempre e um ataque que abranda sempre qualquer fogo exageram o efeito das decisões precisamente quando ele mais importa. Os limiares de intensidade são os de uso corrente no combate. A largura contra o comprimento de chama é a forma habitual de avaliar uma faixa ou uma estrada.

## Consequências

- **Valores provisórios:** os coeficientes da probabilidade de segurar e a frequência dos focos são provisórios até à calibração com o PT-FireSprd.
- **Alcance dos focos:** a distribuição de Sardoy descreve focos a dezenas ou centenas de metros, não as faúlhas de casca de eucalipto a quilómetros. Na grelha de 100 m quase não muda o resultado; na de 30 m conta mais.
- **Diferença entre a corrida principal e o ensemble:** a corrida principal não tem focos secundários, por isso a probabilidade do ensemble pode ir além do mapa principal.
- **Servidor:** os resultados do servidor ainda não trazem a intensidade.
- **Fogo de copas (passo 4d do plano):** fica por fazer. Precisa da altura da base e da densidade das copas, que não temos para Portugal, e a ligação Rothermel–Van Wagner subestima-o (Cruz e Alexander).
