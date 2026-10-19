# ADR 0037: Rede de pontos do Open-Meteo por domínio

- Estado: aceite
- Data: 2026-10-17

## Decisão

A ingestão pede ao Open-Meteo uma rede fixa de 3 × 3 pontos por grelha (um pedido com listas de coordenadas; cerca de 5 km entre pontos em Guimarães), guardada como um snapshot com `key = <grelha>`; a API responde a um ponto com o ponto da rede mais próximo. A bbox converte-se para WGS84 com o ProjNET, com os mesmos parâmetros do EPSG:3763 de `web/src/lib/projection.ts` (testado contra os cantos calculados pelo browser).

## Porquê

Elimina a limitação do "mesmo bin de 0,01°" da versão a pedido: qualquer ponto do domínio tem modelo, também sem rede.

## Alternativas consideradas

Pedir o ponto exato do clique (não cabe num serviço agendado); uma rede nacional grossa ou grelhas ECMWF ([fontes de dados](../referencia/fontes-de-dados.md)) quando houver cobertura nacional.
