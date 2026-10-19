# ADR 0051: Dezasseis vizinhos no modelo de Rothermel

- Estado: substituída pela [ADR 0058](0058-revisao-do-motor.md): 16 direções exatas perdiam até 77% da velocidade da cabeça com o vento entre duas direções
- Data: 2026-10-19
- Atualiza a [ADR 0003](0003-rasterizacao-de-linhas.md)

## Decisão

No modelo de Rothermel, o Dijkstra passa a 16 vizinhos: os 8 de antes mais os 8 saltos de cavalo (2 células numa direção e 1 na outra). O código está em `engine/src/spreadRothermel.ts`.

- **Tempo de cada passo:** soma, sobre as células que a reta entre os centros atravessa, do comprimento dentro de cada célula a dividir pela velocidade dessa célula nessa direção, como no MTT do FlamMap. Um passo para o lado divide-se meio a meio entre as duas células; um salto de cavalo atravessa quatro células, um quarto da reta em cada.
- **Células atravessadas:** têm de ser ardíveis e sem linha de contenção ativa. Assim um salto longo não passa por cima de uma barreira ou de uma linha de uma célula, e as linhas continuam rasterizadas 4-conexas como na ADR 0003.
- **Modelo legado:** fica igual (8 vizinhos, velocidade da célula de destino), para que os seus resultados e testes não mudem enquanto os dois modelos se comparam.

O motor passa também a aceitar várias ignições, cada uma no seu minuto (`Scenario.ignitions`). Na interface isto é a "Área já ardida": um polígono que arde desde o minuto 0, por exemplo um perímetro observado.

## Porquê

Com 8 vizinhos, a elipse de um fogo com vento forte saía cerca de 20% mais estreita do que devia. Com 16 vizinhos, o erro na razão comprimento/largura fica abaixo de 2% com vento de 10 a 18 m/s (`spread-rothermel.test.ts`).

Repartir o tempo pelas células atravessadas trata bem as mudanças de combustível: um passo de erva para folhada leva metade do tempo à velocidade de cada uma.

## Consequências

- **Custo:** cerca do dobro por célula no modelo de Rothermel. Uma corrida em 200 × 200 células com o fogo a cobrir tudo passa de 22 para 46 ms; um fogo de 4 horas em 1 M de células, 31 corridas, passa de 0,19 para 0,29 s.
- **Linhas de contenção:** uma linha numa célula atravessada conta se estiver pronta no minuto de chegada ao destino. É um pouco mais exigente do que contar o minuto em que o fogo passa nessa célula.
