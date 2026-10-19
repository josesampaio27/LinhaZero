# ADR 0017: Overpass com curl

- Estado: aceite
- Data: 2026-10-16

## Decisão

Se o Python não conseguir negociar TLS com o Overpass, o script repete o pedido com o `curl` do sistema.

## Porquê

O Python 3.9 do macOS (LibreSSL 2.8) falha o handshake com overpass-api.de; o `curl` não.

## Alternativas consideradas

Exigir que todos tenham um Python recente com OpenSSL (continua a ser o recomendado).
