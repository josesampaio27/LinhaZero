# ADR 0071: Células escolhidas uma a uma nas variantes de grelha

- Estado: aceite
- Data: 2026-10-22
- Completa a [ADR 0025](0025-variantes-de-grelha.md): uma alteração pode ter uma lista de células em vez de uma área ou linha

## Contexto

No Editor de grelha, cada alteração era uma área ou uma linha desenhada ponto a ponto. Para mudar algumas células (um
quintal, um troço de caminho) era preciso desenhar um polígono à volta delas, e o polígono apanhava quase sempre células
a mais ou a menos.

## Decisão

- **Selecionar e depois aplicar:** no editor escolhem-se células, tocando ou arrastando (pincel de 1, 3×3 ou 5×5),
  ou com uma área; depois aplica-se uma ação à seleção: não combustível, outro combustível, acrescentar ou tirar
  barreira.
- **Formato:** `setFuel`, `addBarrier` e `removeBarrier` aceitam `cells: [linha, coluna][]` em vez de `polygon` ou
  `line`. Cada alteração tem uma só geometria. O formato continua na versão 1: os ficheiros antigos abrem sem mudança.
- **Limite:** no máximo 20 000 células por alteração; o editor divide uma seleção maior em várias. Assim um pedido de
  corrida com duas variantes fica bem abaixo do limite de 1 MB de uma mensagem do NATS (o worker valida as variantes com
  a mesma função do browser; a API passa-as sem as ler).
- **Selecionar uma área** junta à seleção as células que a área cobriria (`editCells`), por isso há um só caminho para
  aplicar alterações.

## Porquê

- Células em `[linha, coluna]` dizem exatamente o que muda, sem depender da rasterização de um polígono.
- Guardar a lista em vez de converter tudo em polígonos é simples e reversível, e cabe no `variantHash` sem mudanças.

## Consequências

- As células só fazem sentido na grelha da variante. A variante já está presa a essa grelha pelo `base.sha256`.
- Uma seleção grande ocupa mais espaço do que um polígono (cerca de 10 bytes por célula). Com o limite, uma variante
  fica abaixo de cerca de 200 kB por alteração.
