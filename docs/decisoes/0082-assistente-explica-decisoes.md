# ADR 0082: O assistente explica as decisões e diz o que muda a resposta

- Estado: aceite
- Data: 2026-10-23
- Acrescenta às ADR [0079](0079-assistente-com-claude-haiku.md) (o assistente) e
  [0081](0081-assistente-coloca-acoes-em-qualquer-sitio.md) (onde pôr as ações)

## Contexto

O assistente sabia dizer o veredicto ("B é melhor em 143 de 200 cenários"), mas não porquê:
- que ação de B fez a diferença;
- porque é que uma linha foi galgada;
- quão espalhados estão os resultados nos cenários;
- o que faria a resposta mudar.

O prompt já pedia "o que muda a resposta" no resumo para o COS, mas nenhuma ferramenta o calculava, e o modelo tinha de
adivinhar. O motor já tem quase tudo: a intensidade por célula, o comprimento de chama (`flameLength`), a
probabilidade de uma linha segurar (`holdProbability`) e os números de cada cenário.

## Decisão

Mais factos do motor, em texto, para o modelo explicar (`web/src/assistant/explain.ts` e `tools.ts`):
- **`explain_decision`:** corre a decisão sem cada uma das suas ações, com as outras no lugar. Diz quantos edifícios e
  hectares se perdem sem ela, que aldeias protege (o fogo deixa de chegar, ou chega mais tarde), que ações não têm
  efeito ou pioram o resultado, e se as ações só resultam juntas ou fazem o mesmo trabalho.
- **`check_plan`** passa a correr também a decisão com as ações e diz o fogo que cada uma enfrenta:
  - linhas: o comprimento das chamas nas células a arder junto à linha, onde o motor decide se ela segura;
  - linhas de contenção: com que frequência a largura as segura, e a largura (1, 4, 10 ou 25 m) que as seguraria em
    90% das vezes;
  - descargas aéreas: com que frequência seguram;
  - ataques e zonas protegidas: quanto efeito mantêm os meios, medido no fogo sem ações (o que os meios enfrentam
    antes de o abrandar).
- **`stress_test`:** A e B corridos sem incerteza com o vento rodado 20° para cada lado, 30% mais fraco e 30% mais
  forte (cada passo da previsão mudado da mesma forma). Diz quem ganha em cada caso e o que vira a resposta.
- **`latest_start`:** procura, com precisão de 5 min, até que minuto uma ação pode começar e ainda poupar pelo menos
  metade do que poupa agora. Diz a margem em minutos.
- **Dispersão:** com a incerteza ligada, o estado e `get_results` dão, por decisão, o intervalo de 80% dos cenários
  (percentis 10 e 90) e a mediana dos hectares e dos edifícios.
- O prompt manda responder aos "porquê" com estas ferramentas e usá-las no "o que muda a resposta" do resumo para o
  COS.

## Porquê

- É a regra da ADR 0079 (o modelo traduz, o motor decide) aplicada à explicação: um "porquê" que o modelo inventa
  pode estar errado sobre números certos.
- Tudo corre no browser, como o resto do assistente: na grelha de 30 m, cada ferramenta responde em menos de 1 s (3
  ações, 10 corridas no teste ao vento).

## Alternativas consideradas

- **O teste ao vento com o ensemble:** daria probabilidades, mas custa 200 a 500 corridas por variação. As variações
  fixas mostram o que pode virar a resposta; o ensemble continua a dizer com que probabilidade.
- **Guardar o vento de cada cenário e dizer em que ventos B perde:** precisava de mudar o resultado do ensemble e o
  contrato com o worker. Fica para depois.

## Consequências

- As explicações vêm de corridas sem incerteza; a resposta diz isso.
- As chamas e as larguras usam os coeficientes por omissão. Com uma variante de grelha, o `check_plan` avisa que os
  valores podem ser outros.
- O assistente tem dezassete ferramentas.
