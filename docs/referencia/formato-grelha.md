# Formato da grelha

Como se guarda uma grelha em disco. Os tipos estão em `engine/src/types.ts` (`GridHeader`, `GridData`); quem escreve grelhas é `data-prep/build_grid.py` (dados reais) e `engine/scripts/make-synthetic-grid.ts` (grelha sintética).

**Estado:** feito. As adições planeadas estão no fim.

## Ficheiros

Cada grelha é uma pasta em `web/public/grids/<nome>/`:

```text
web/public/grids/
  index.json            lista de grelhas que a interface oferece
  guimaraes/
    header.json         cabeçalho
    fuel.u8             uma camada por ficheiro
    elevation.f32
    barrier.u8
    buildings.u16
    village.u16
    canopy.u8         (opcional)
```

`index.json` é uma lista de `{ "name": "<pasta>", "label": "<nome na interface>" }`.

## Camadas

Todas as camadas têm `rows × cols` valores, por linhas, a começar no canto noroeste, em little-endian. A extensão diz o tipo ([ADR 0002](../decisoes/0002-formato-dos-binarios.md)).

| Camada | Tipo | Conteúdo |
| --- | --- | --- |
| `fuel` | Uint8 | Código do modelo de combustível (FUMOD na grelha real); a velocidade de cada código está em `fuelTable` |
| `elevation` | Float32 | Altitude em metros |
| `barrier` | Uint8 | 0 = sem barreira; 1 = superfície de água que o fogo não atravessa; 2 a 255 = estrada ou rio com essa largura em metros (OSM, ou 30 m numa autoestrada, 20 numa via rápida, 10 numa estrada nacional, 7 numa secundária, 15 num rio), que o modelo de Rothermel deixa galgar conforme o comprimento de chama. O modelo legado trata qualquer valor diferente de 0 como barreira |
| `buildings` | Uint16 | Número de edifícios na célula |
| `village` | Uint16 | Id do lugar a que a célula pertence (0 = nenhum) |
| `canopy` (opcional) | Uint8 | Coberto arbóreo, em % (Copernicus Tree Cover Density 2018); 255 = sem dados. Abriga do vento a folhada e o sub-bosque no modelo de Rothermel. Uma grelha sem esta camada tem o mesmo hash que tinha antes de a camada existir |

## `header.json`

| Campo | Tipo | Significado |
| --- | --- | --- |
| `name` | texto | Nome da grelha (igual ao da pasta) |
| `crs` | `"EPSG:3763"` | Sistema de coordenadas: PT-TM06 / ETRS89, em metros |
| `originX`, `originY` | número | Canto noroeste da grelha, em metros |
| `cellSize` | número | Lado de cada célula, em metros (por exemplo 100) |
| `rows`, `cols` | inteiro | Número de linhas e de colunas |
| `layers` | objeto | Nome do ficheiro de cada camada: `fuel`, `elevation`, `barrier`, `buildings`, `village` e, se existir, `canopy` |
| `villages` | lista | `{ "id": <inteiro>, "name": "<nome>" }` para cada lugar |
| `fuelTable` | objeto | Para cada código de combustível: `{ "label": "<designação>", "baseRate": <m/min> }`. Velocidade 0 = não arde |

A célula (linha *r*, coluna *c*) cobre, em metros, de `originX + c × cellSize` a `originX + (c + 1) × cellSize` e de `originY − r × cellSize` a `originY − (r + 1) × cellSize`.

## Grelhas existentes

| Grelha | Tamanho | Origem |
| --- | --- | --- |
| `sintetica` | 150 × 150 células de 100 m | Gerada por `npm run grid:synthetic` (determinista). Só de teste: fora de `index.json`, a interface, a API e a ingestão não a usam |
| `guimaraes` | 157 × 152 células de 100 m, da cidade à Penha | FUMOD, Copernicus DEM e OpenStreetMap, por `data-prep/build_grid.py` ([ADR 0016](../decisoes/0016-zona-real.md)) |
| `guimaraes-30m` | 520 × 503 células de 30 m | `build_grid.py --cell 30`, a mesma área. O combustível FUMOD tem 100 m e é reamostrado; as barreiras, o relevo e o coberto são mais finos. Na mesma simulação, a área ardida fica perto da da grelha de 100 m (Rothermel: 188 contra 160 ha em 4 h) |

## Adições planeadas

Ver [Grelhas e versões](../arquitetura/08-conceitos.md#grelhas-e-versões):

- `version`, o hash sha256 de cada camada e a origem dos dados (fonte e data de cada download) no `header.json`;
- pastas imutáveis por versão (`grids/guimaraes/2026.1/`) e um manifesto assinado;
- ids de lugar em 32 bits quando a cobertura passar de um distrito.
