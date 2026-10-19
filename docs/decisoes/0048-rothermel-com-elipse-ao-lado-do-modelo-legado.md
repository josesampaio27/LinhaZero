# ADR 0048: Rothermel com elipse, ao lado do modelo legado

- Estado: aceite
- Data: 2026-10-19

## Decisão

O motor passa a ter dois modelos de velocidade, escolhidos por `Scenario.spreadModel`:

- **`legacy`** (por omissão): `baseRate × exp(vento) × exp(declive)`, igual ao de antes.
- **`rothermel`**: Rothermel (1972) com os ajustes de Albini (1976), tal como no BehavePlus (`engine/src/rothermel.ts`):
  - vento e declive somados como vetores;
  - limite de vento;
  - elipse de Anderson para a velocidade em cada direção;
  - intensidade de Byram e comprimento de chama.

O vento de 10 m passa a vento a meia altura da chama, com o fator de ajuste de cada modelo de combustível. A humidade do combustível entra como `Scenario.moisture`; por omissão, um fim de tarde seco de verão.

Os parâmetros dos modelos portugueses vêm de Fernandes e Loureiro (2021), secção 2. Estão transcritos em `data-prep/fuel_params.csv` e são acrescentados ao `fuelTable` de cada grelha. Os modelos com erva são dinâmicos: a erva seca e passa a combustível morto, como no BehavePlus.

O modelo por omissão só muda para `rothermel` quando estiver decidido o fator de ajuste do vento debaixo das árvores (ver [Modelo de propagação](../modelo/propagacao.md)). Uma grelha sem parâmetros é recusada com uma mensagem clara.

## Porquê

Um só número por combustível não dá ao mesmo tempo a velocidade certa na frente e nos flancos (ver [Modelo de propagação](../modelo/propagacao.md)). O Rothermel é o padrão dos simuladores operacionais e os modelos FUMOD foram parametrizados para ele.

As equações correm nas unidades originais (pés, libras, Btu), com entradas e saídas em SI. Os testes comparam com o núcleo C++ do BehavePlus (via pyrothermel), em 7 modelos de Anderson e 7 condições: a diferença fica abaixo de 1% na velocidade, na intensidade, no comprimento de chama, na direção e nas velocidades de flanco e de retaguarda.

Manter o modelo legado durante a transição deixa os cenários e as variantes guardados a funcionar sem mudanças.

## Consequências

- **Custo:** cerca de 2 vezes o do modelo legado com o fogo a cobrir a grelha toda, e 1,4 vezes num fogo de 4 horas numa grelha de 1 M células (`npm run bench`).
- **Grelha de 8 vizinhos:** com vento forte, a elipse sai cerca de 20% mais estreita do que devia. Fica registado como teste que falha de propósito (`it.fails`) até ao estêncil de 16 vizinhos.
- **Variantes:** as velocidades editadas no Editor de grelha (`fuelRates`) só afetam o modelo legado. As edições de combustível e de barreiras afetam os dois.

## Alternativas consideradas

- **Usar o pyretechnics como referência:** foi descartado. Projeta o vento no plano do declive (dá mais vento em encosta do que o BehavePlus) e, na tabela dele, o combustível vivo do modelo 4 de Anderson está como herbáceo em vez de lenhoso.
- **Correr o Rothermel num serviço Python:** foi descartado. O motor continua uma função pura em TypeScript ([ADR 0024](0024-motor-continua-em-typescript.md)).
