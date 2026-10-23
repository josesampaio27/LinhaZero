# ADR 0081: O assistente coloca ações em qualquer sítio, e o motor escolhe o melhor

- Estado: aceite
- Data: 2026-10-23
- Acrescenta à [ADR 0079](0079-assistente-com-claude-haiku.md) (o assistente); a regra "o modelo nunca escreve
  coordenadas" mantém-se

## Contexto

Na [ADR 0079](0079-assistente-com-claude-haiku.md) o assistente só podia pôr uma ação a partir de uma aldeia ou da
ignição: no caminho do fogo para uma aldeia, à volta dela, ou numa reta entre duas. Em uso, isto deixava de fora os
sítios onde se combate um incêndio a sério: a cabeça do fogo longe de qualquer aldeia, os flancos, uma linha a 1 km de
um lugar. E a escolha do sítio ficava com o modelo, que é fraco a raciocinar sobre mapas: punha a linha a meio do
caminho e esperava que resultasse.

## Decisão

- **Mais sítios, sem coordenadas** (`web/src/assistant/places.ts`):
  - "cabeça do fogo": a célula a arder mais longe da ignição, numa corrida da decisão;
  - "flanco esquerdo" e "flanco direito": a célula mais afastada para cada lado da linha da ignição à cabeça, olhando
    da ignição para a cabeça;
  - `offset_m` com `offset_direction` (norte … noroeste) desloca qualquer lugar ("800 m a sudoeste de Gonça").
  - As formas não mudam (`across_path`, `fire_head`, `around_place`, `between_places`): só há mais lugares onde as usar.
- **Pontas apoiadas** (`web/src/assistant/anchor.ts`): cada ponta de uma linha de contenção ou de um contrafogo
  estende-se ao longo da linha, até 1 km, até à primeira estrada, rio, água, zona sem combustível ou limite da zona.
  Uma ponta sem nada a menos de 1 km fica onde estava, e o resultado diz isso. As linhas entre dois lugares nomeados
  não se estendem, a não ser que o modelo peça (`anchor`). O `check_plan` usa o mesmo teste.
- **O motor escolhe o sítio** (ferramenta `compare_placements`, `web/src/assistant/compare.ts`):
  - para uma ação (tipo e minuto de início), a aplicação monta até 16 sítios: linhas atravessadas no caminho do fogo a
    1/4, 1/2 e 3/4 do tempo até ao alvo, com dois comprimentos; ataques à cabeça; zonas à volta das casas;
  - os alvos são os lugares pedidos ou, por omissão, as duas primeiras aldeias a que o fogo chega depois do início e a
    cabeça do fogo;
  - corre a decisão uma vez por sítio (as ações que já tem mais a nova, sem incerteza) e ordena por edifícios
    atingidos, depois por hectares;
  - devolve as melhores com os parâmetros para `place_intervention`, ou coloca a melhor (`place_best`) se melhorar a
    decisão.

## Porquê

- **Os lugares continuam a ser nomes:** o modelo escolhe "cabeça do fogo" ou "1 km a este de X", e a geometria
  continua a ser calculada pela aplicação, como a ADR 0079 decidiu.
- **Pontas apoiadas:** uma linha solta no meio do mato é contornada pelo fogo; apoiar as pontas é a prática no
  terreno, e o `check_plan` já o apontava como erro.
- **Comparar no motor:** é a abordagem da ADR 0079 (o modelo traduz, o motor decide) aplicada ao sítio. Uma corrida
  demora cerca de 0,1 s na grelha de 30 m; 16 sítios respondem em 1 a 2 s.

## Alternativas consideradas

- **O modelo dar coordenadas ou células:** rejeitado pela mesma razão da ADR 0079.
- **Otimizar a geometria (procura contínua do melhor traçado):** melhor resultado, mas muitas mais corridas e uma
  linha que ninguém sabe explicar. Os 16 sítios fixos chegam para escolher entre opções que um coordenador reconhece.
- **Ordenar com o ensemble:** mais robusto ao vento, mas 200 a 500 vezes mais caro por sítio. A ordem é de uma corrida;
  o assistente confirma a escolhida com "Simular" (e a incerteza, se ligada).

## Consequências

- O assistente tem catorze ferramentas.
- A ordem dos sítios vem de uma corrida sem incerteza: com vento perto do limite, a melhor opção pode não ganhar no
  ensemble. O prompt manda simular depois de colocar.
- As linhas apoiadas podem ficar até 2 km mais compridas do que o pedido; o resultado diz quanto cada ponta cresceu.
