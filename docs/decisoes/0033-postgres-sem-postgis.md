# ADR 0033: Postgres sem PostGIS

- Estado: aceite
- Data: 2026-10-17

## Decisão

`postgres:16`, sem PostGIS.

## Porquê

Ainda não há nenhuma consulta espacial, e `postgis/postgis` só existe para amd64.

## Alternativas consideradas

PostGIS. Troca-se a imagem no dia em que aparecer uma coluna de geometria.
