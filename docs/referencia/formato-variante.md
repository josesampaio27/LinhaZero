# Formato da variante de grelha

O ficheiro que o Editor de grelha guarda: uma grelha oficial de base mais a lista de alterações. A decisão está na [ADR 0025](../decisoes/0025-variantes-de-grelha.md).

**Estado:** feito. A definição e a aplicação estão em `engine/src/variant.ts` (`parseGridVariant`, `applyVariant`, `variantHash`, `checkVariantBase`), partilhadas pelas duas páginas, pelos testes e, depois, pela API.

## Exemplo

```json
{
  "version": 1,
  "id": "faixa-penha",
  "name": "Faixa de gestão da Penha",
  "description": "Faixa de 100 m a sul de Souto do Monte",
  "base": { "grid": "guimaraes", "version": "2026.1", "sha256": "9f2c…" },
  "fuelRates": { "223": 3 },
  "params": { "kWind": 0.12 },
  "edits": [
    { "kind": "setFuel", "fuel": 98, "polygon": [[-9120, 198340], [-8410, 198340], [-8410, 198240], [-9120, 198240]] },
    { "kind": "addBarrier", "line": [[-9600, 197900], [-8800, 198100]] }
  ]
}
```

## Campos

| Campo | Tipo | Significado |
| --- | --- | --- |
| `version` | `1` | Versão do formato |
| `id` | texto | Identificador da variante; se faltar, é criado a partir do hash |
| `name`, `description` | texto | Nome e descrição mostrados na interface; não entram no hash |
| `base.grid`, `base.sha256` | texto | A grelha oficial de base e o seu hash: `hashGrid`, o sha256 do `header.json` em JSON canónico seguido dos bytes de todas as camadas (`engine/src/hash.ts`) |
| `base.version` | texto, opcional | A versão da grelha de base, quando as grelhas tiverem versão ([Formato da grelha](formato-grelha.md)) |
| `fuelRates` | objeto | Velocidade base nova (m/min) por código de combustível; os códigos têm de existir no `fuelTable` da base |
| `params` | objeto | Coeficientes do modelo alterados: `kWind`, `kSlope`, `minSlopeFactor`, `suppressionFactor`, `protectFactor` (os valores de origem estão em `engine/src/params.ts`) |
| `edits` | lista | Alterações às camadas, aplicadas por ordem |

### Alterações

| `kind` | Campos | Efeito |
| --- | --- | --- |
| `setFuel` | `fuel` (código), e `polygon` (pelo menos 3 pontos `[x, y]`) ou `cells` | As células da área, ou as escolhidas, passam a ter esse combustível (por exemplo 98, não combustível, numa faixa de gestão) |
| `addBarrier` | `line` (pelo menos 2 pontos `[x, y]`) ou `cells` | As células da linha, rasterizada 4-conexa, ou as escolhidas, passam a barreira (uma estrada ou aceiro novo) |
| `removeBarrier` | `polygon` ou `cells` | As células da área, ou as escolhidas, deixam de ser barreira |

Cada alteração tem uma só geometria. As coordenadas de `polygon` e `line` estão em metros, EPSG:3763, e só se convertem em células ao aplicar a variante, com as mesmas regras de rasterização das intervenções ([ADR 0003](../decisoes/0003-rasterizacao-de-linhas.md)). `cells` é a lista das células escolhidas uma a uma no editor, `[linha, coluna]` a contar do canto noroeste: de 1 a 20 000 células por alteração, todas dentro da grelha (o editor divide uma seleção maior em várias alterações; [ADR 0071](../decisoes/0071-celulas-nas-variantes-de-grelha.md)). Exemplo: `{ "kind": "setFuel", "fuel": 98, "cells": [[40, 61], [40, 62], [41, 62]] }`. Editar edifícios e lugares fica para depois.

## Regras

- **Aplicação:** `applyVariant(grelha, variante)` devolve uma grelha nova, sem alterar a de base: primeiro `fuelRates`, depois as alterações pela ordem da lista. É uma função pura, com testes.
- **Validação:** a variante só se aplica se `base.sha256` for o da grelha carregada; se a grelha oficial mudar, a simulação recusa-a com uma mensagem, e o editor avisa e propõe "Reaplicar à versão atual". Códigos de combustível desconhecidos, polígonos com menos de 3 pontos, células fora da grelha, alterações com área e células ao mesmo tempo e coeficientes fora do intervalo permitido são recusados com uma mensagem em português, como nos cenários.
- **Hash:** `variantHash` é o sha256 do `base.sha256` mais `fuelRates`, `params` e `edits` em JSON canónico. Cenários e registos de simulação guardam este hash ([Reprodutibilidade](../arquitetura/08-conceitos.md#reprodutibilidade-e-auditoria)).
- **Onde se guarda:** no browser (`localStorage`) e em ficheiro, com "Exportar" e "Importar" (feito); dentro do ficheiro de cenário, para que este se abra noutro computador (feito, [Formato do cenário](formato-cenario.md)); na base de dados, pela API, com as mesmas regras de entidade e visibilidade dos cenários (planeado).
- **Nunca é oficial:** uma variante não substitui a grelha oficial. A interface mostra sempre que se está a usar uma variante.
