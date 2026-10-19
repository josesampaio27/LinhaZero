# ADR 0015: Ensemble emparelhado

- Estado: aceite
- Data: 2026-10-17

## Decisão

A e B correm com a mesma semente; a corrida *k* das duas decisões tem o mesmo vento e compara-se uma com a outra (`comparePaired`). As mensagens principais dizem em quantos cenários a mesma decisão é melhor ("B poupa 79 edifícios · B é melhor em 27 de 30 cenários"); a tabela dá a diferença mediana e o intervalo central de 80% (sem os 10% de corridas mais extremas de cada lado: da 4.ª à 27.ª de 30). Quando a corrida com o vento previsto e a maioria dos cenários apontam decisões diferentes, a mensagem diz "mas".

## Porquê

Comparar corrida a corrida tira o ruído do vento da diferença e permite dizer "B é melhor em 27 de 30 cenários", que é o que interessa a quem decide. A estatística é simétrica: trocar A com B só troca o sinal.

## Alternativas consideradas

Sementes independentes por decisão; comparar só os mapas de probabilidade; percentis por posição simples (davam números diferentes consoante a decisão chamada A).
