# ADR 0074: Faúlhas de longo alcance: estudadas, não adotadas

- Estado: aceite (não se adota nenhum modelo de faúlhas de longo alcance)
- Data: 2026-10-22
- Marco M7 da etapa B do plano [Melhorias do motor](../plano/melhorias-do-motor.md)

## Contexto

- O motor só tem focos secundários a dezenas ou centenas de metros (Sardoy et al. 2008, `engine/src/spotting.ts`). A casca de alguns eucaliptos leva fogo a quilómetros.
- O guia da CSIRO (Cruz et al. 2015) descreve o fenómeno (focos confirmados a cerca de 30 km, em eucaliptos de casca lisa como *E. globulus*) mas diz que não há um modelo quantitativo.
- O único modelo quantitativo encontrado é Storey, Price, Sharples e Bradstock (2020), *Drivers of long-distance spotting during wildfires in south-eastern Australia*, International Journal of Wildland Fire 29(6): 459–472, doi:10.1071/WF19124: 338 incêndios australianos medidos em imagens de avião, 2002–2018.

## O que o artigo dá

- **Distância máxima de faúlhas** de cada fogo (tabela 2: modelo gama com ligação logarítmica, em metros), a partir da área do fogo (o fator mais forte), da cobertura das copas, do vento a 10 m, do declive, da exposição do terreno ao vento e do vento a 500 hPa. Os exemplos do próprio artigo reproduzem-se com os coeficientes publicados (cerca de 4 km para um fogo de 1000 ha em floresta densa e declivosa com vento forte; cerca de 0,4 km em terreno plano e floresta rala).
- **Ocorrência e número de focos a mais de 500 m** (tabela 3), a partir da área do fogo, do vento, do declive, da altura das copas, de um índice de humidade do combustível, da instabilidade da atmosfera e do vento em altitude.
- Distâncias observadas de 5 m a 13,9 km (média 0,9 km); só 11 dos 338 fogos lançaram faúlhas a mais de 5 km.

## Decisão

Não se adota. A regra pedida para esta etapa é só adotar o que se sabe ser fiável, e aqui não se sabe:

- o modelo prevê a **distância máxima** esperada de cada fogo, não a distribuição das distâncias (o parâmetro de dispersão não é publicado), por isso o simulador não conseguiria sortear distâncias realistas;
- faltam-nos variáveis de entrada (vento a 500 hPa, índice de exposição ao vento, instabilidade, altura das copas); teriam de ficar nos valores médios do artigo, o que é um pressuposto e não um dado;
- foi ajustado em floresta de eucalipto australiana; a aplicação a Portugal não está testada;
- não se pode validar aqui: o PT-FireSprd regista perímetros, não focos secundários.

## Consequências

- O motor continua sem faúlhas de longo alcance; a ficha técnica e a documentação do modelo já o dizem como limitação.
- Volta a considerar-se se aparecer um modelo com a distribuição das distâncias, validado em condições ibéricas, ou dados de focos secundários em incêndios portugueses.
