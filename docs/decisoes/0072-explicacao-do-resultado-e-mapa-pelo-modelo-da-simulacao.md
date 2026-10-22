# ADR 0072: Explicação do resultado, e o mapa e o inspetor pelo modelo da simulação

- Estado: aceite
- Data: 2026-10-22
- Etapa A do plano [Melhorias do motor](../plano/melhorias-do-motor.md) (marcos M1, M2 e M3)

## Contexto

- Quem experimentou a aplicação não conseguia perceber bem a propagação: via onde o fogo chegava, mas não por onde nem porquê.
- As cores do combustível e a "velocidade base" do inspetor vinham da tabela do modelo simples, já retirado (`data-prep/fuel_rates.csv`). O que o mapa mostrava não era o que a simulação usava.
- Os números publicados (site, ficha técnica, documentação) vêm de `landing/src/data/site-data.json`, e ficaram para trás sem ninguém dar por isso.

## Decisão

- **Explicação do resultado (M1):**
  - com `Scenario.explain`, a simulação sem sorteios guarda, por célula, de que célula o fogo chegou e as partes da velocidade da cabeça do fogo nessa altura: `r0 × (1 + vento + declive)`, com o vento e o declive projetados na direção da cabeça (`headFire` devolve `windPart` e `slopePart`);
  - `firePath` e `explainPath` (`engine/src/explain.ts`) dão o caminho até uma célula, o tempo, o comprimento, a velocidade média, o peso do combustível, do vento e do declive pesado pelo tempo de cada passo, a parte do tempo na cabeça do fogo, em fogo de copas e atrasada por ações de combate, e os combustíveis pelo caminho;
  - na aplicação, no resultado, tocar num ponto do mapa ou num lugar da tabela desenha o caminho nos dois mapas e explica as duas decisões. Quando o resultado vem do servidor, o browser corre a simulação sem sorteios de cada decisão para a explicar (milissegundos na grelha de 100 m).
- **Um só modelo no ecrã (M2):** as cores do combustível, as amostras e a legenda do Editor de grelha, e o inspetor mostram a velocidade da cabeça do fogo pelo modelo de Rothermel, com a calibração em uso e o abrigo das árvores de cada célula, com vento de 10 km/h em terreno plano e a humidade de omissão (`referenceHeadRates`). A escala de cor é logarítmica, de 0,5 a 20 m/min. Um teste (`engine/test/grids.test.ts`) exige que, em todas as grelhas publicadas, um combustível arda exatamente quando tem parâmetros de Rothermel: a velocidade base antiga nunca decide nada sozinha.
- **Validação automática (M3):** `engine/test/site-data.test.ts` falha quando `site-data.json` não corresponde à calibração em uso, às perturbações da incerteza ou à grelha de Guimarães. Para o regenerar: `npm run landing-data -w engine` (precisa dos casos de referência).

## Porquê

- O caminho e as partes da velocidade saem de graça do próprio cálculo: não é preciso outro modelo nem outra simulação.
- Sem vento, o Rothermel quase não distingue erva de mato (cerca de 0,3 m/min ambos em Guimarães); o que os separa é a resposta ao vento. Por isso a cor usa um vento de referência moderado.

## Consequências

- As percentagens dizem o que pesou na **cabeça** do fogo. Um caminho que veio pelos flancos anda mais devagar do que a cabeça; o painel diz que parte do tempo foi na cabeça.
- A explicação é da simulação sem sorteios, a do mapa de chegada; não explica o mapa de cenários.
- As cores de uma variante usam a calibração em uso, e não os coeficientes que a variante muda.
- O teste do M3 não deteta mudanças da física que não mudem a calibração; nesse caso continua a ser preciso regenerar o ficheiro (marco M13).
