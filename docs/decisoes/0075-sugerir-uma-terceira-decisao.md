# ADR 0075: Sugerir uma terceira decisão

- Estado: aceite
- Data: 2026-10-22
- Marco M10 da etapa C do plano [Melhorias do motor](../plano/melhorias-do-motor.md); o M9 (meios com deslocação) não se faz

## Contexto

Quem usa a aplicação compara duas decisões que desenhou. O simulador pode também propor uma alternativa, a partir do caminho que o fogo faz até ao que ameaça ([ADR 0072](0072-explicacao-do-resultado-e-mapa-pelo-modelo-da-simulacao.md)).

## Decisão

- **Linhas de contenção no caminho do fogo** (`suggestLines`, `engine/src/suggest.ts`):
  - a partir de uma decisão (A ou B), com as suas ações, simula-se sem sorteios e procuram-se os lugares que o fogo atinge (os três primeiros); sem nenhum, a cabeça do fogo;
  - em cada caminho, a 25%, 50% e 75% do tempo entre a linha estar pronta (mais 15 minutos de margem) e o fogo chegar ao lugar, experimentam-se linhas perpendiculares ao caminho de 500 m, 1 km e 2 km, sem as células onde o fogo já está quando a linha fica pronta;
  - cada linha é acrescentada às ações da decisão e simulada; ficam as que poupam pelo menos um edifício, ou pelo menos 10 células e 2% da área que arde; ordenam-se por edifícios poupados, depois área, depois a linha mais curta; uma por ponto do caminho, até três.
- **Sem logística:** o M9 não se faz. Quem usa diz quando a linha fica pronta e com que largura (as larguras das linhas de contenção da aplicação). A aplicação diz-o junto das sugestões.
- **Na aplicação**, no resultado: "Sugerir uma terceira decisão", com a decisão de partida, o minuto e a largura; cada sugestão mostra-se no mapa e "Pôr na decisão B" (ou A) substitui a outra decisão pela de partida com a linha, para a simular com incerteza.

## Porquê

- Uma linha perpendicular ao caminho do fogo é a forma mais simples de o cortar, e a simulação de cada candidata diz se a linha segura com aquelas chamas.
- Poucas candidatas (até 27) correm em cerca de um segundo na grelha de 100 m, no browser.

## Consequências

- As sugestões são comparadas sem sorteios; a incerteza confirma-se depois, na comparação normal.
- Com chamas altas, linhas estreitas não seguram e pode não haver sugestão; a aplicação diz porquê.
- Uma linha sugerida pode não ser exequível no terreno a tempo: é uma proposta para avaliar, não uma ordem.
- Mais tarde: um corte mínimo no grafo de tempos de chegada, em vez de linhas candidatas ([Modelo de propagação](../modelo/propagacao.md#sugerir-um-terceiro-caminho-planeado)).
