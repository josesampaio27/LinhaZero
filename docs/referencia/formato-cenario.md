# Formato do ficheiro de cenário

O ficheiro que "Guardar cenário" escreve e que "Carregar cenário" e `?scenario=` leem. A definição e a validação estão em `engine/src/scenario.ts` (`SavedScenario`, `parseSavedScenario`), partilhadas pela interface, pelos scripts e pelos testes ([ADR 0020](../decisoes/0020-ficheiros-de-cenario-tratados-no-motor.md)).

**Estado:** versão 3, feito.

## Exemplo

```json
{
  "version": 3,
  "title": "Fogo a caminho de Souto do Monte",
  "grid": "sintetica",
  "ignition": [-4950, 202650],
  "wind": { "directionDeg": 225, "speedMs": 7 },
  "durationMin": 240,
  "ensemble": false,
  "decisions": {
    "A": [],
    "B": [
      {
        "id": "b1",
        "kind": "containmentLine",
        "startMin": 30,
        "coords": [[-7020, 203960], [-4850, 203600], [-2680, 203240]]
      }
    ]
  },
  "variants": { "A": null, "B": null }
}
```

## Campos

| Campo | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `version` | `3` | sim | Versão do formato |
| `title` | texto | não | Título mostrado na interface |
| `grid` | texto | sim | Nome da grelha (pasta em `web/public/grids/`) |
| `ignition` | `[x, y]` ou `null` | não | Ponto de ignição em metros, EPSG:3763; tem de cair dentro da grelha |
| `wind.directionDeg` | número | não (270) | Direção **de onde** sopra o vento, em graus a partir do norte, no sentido dos ponteiros |
| `wind.speedMs` | número ≥ 0 | não (5) | Velocidade do vento em m/s |
| `durationMin` | número > 0 | não (240) | Duração simulada, em minutos |
| `ensemble` | booleano | não (falso) | Liga a incerteza: 30 corridas com vento perturbado ([Incerteza](../modelo/incerteza.md)) |
| `decisions.A`, `decisions.B` | lista | sim (pode ser vazia) | As intervenções de cada decisão. Uma linha de contenção pode ter `widthM` (largura em metros, usada no Rothermel; por omissão 4 m) |
| `variants.A`, `variants.B` | variante ou `null` | não (`null`) | A [variante de grelha](formato-variante.md) em que cada decisão corre, inteira dentro do ficheiro, para que este se abra noutro computador; `null` = grelha oficial. A mesma variante nas duas decisões testa uma grelha alterada; só na B, compara grelhas |
| `spreadModel` | `"legacy"` ou `"rothermel"` | não (`"legacy"`) | Modelo de propagação ([Modelo de propagação](../modelo/propagacao.md)). Uma versão anterior da aplicação ignora este campo e usa o modelo legado |
| `moisture` | objeto | não (verão: 6/7/8%, 60%, 90%) | Só com `rothermel`: humidade do combustível, em frações (0–3): `d1`, `d10`, `d100` (morto de 1, 10 e 100 h), `liveHerb`, `liveWoody` (vivo herbáceo e lenhoso) |
| `burnedArea` | lista de `[x, y]` | não | Área já ardida no início, um polígono em metros (EPSG:3763) com pelo menos 3 cantos. Arde desde o minuto 0, com a ignição |
| `weatherSteps` | lista | não | Tempo hora a hora: `{ fromMin, wind, moisture? }` por ordem crescente de `fromMin` (máximo 48). Substitui `wind` (e, em cada passo com `moisture`, a humidade) |

### Intervenção

| Campo | Tipo | Significado |
| --- | --- | --- |
| `id` | texto | Identificador; se faltar, fica `A1`, `A2`, … |
| `kind` | `containmentLine`, `suppression` ou `protectZone` | Linha de contenção, Ataque ou Proteger zona |
| `startMin` | número ≥ 0 | Minuto a partir do qual a intervenção conta |
| `rateFactor` | número ≥ 0 | Só para zonas: fator da velocidade. Se faltar, vale o da ferramenta: 0,2 no Ataque e 0,1 em Proteger zona, ou o que a variante da decisão disser |
| `coords` | lista de `[x, y]` | Vértices em metros, EPSG:3763: pelo menos 2 numa linha, 3 numa zona |

## Validação

`parseSavedScenario` recusa ficheiros com erros e diz em português o que está errado, por exemplo *"Ficheiro de cenário inválido: a ação 1 da decisão B precisa de pelo menos 2 pontos [x, y] em metros"*.

## Versões

| Versão | Diferença | Estado |
| --- | --- | --- |
| 1 | A ignição era uma célula `{ "row", "col" }` | Ainda se lê: a ignição passa para o centro dessa célula ([ADR 0010](../decisoes/0010-geometrias-guardadas-em-metros.md)) |
| 2 | Ignição em metros | Feito |
| 3 | `variants`: a variante de grelha de cada decisão, dentro do ficheiro | Feito |
| 4 | Versão e hash da grelha, versão do motor, versão dos parâmetros e opções de incerteza ([Reprodutibilidade](../arquitetura/08-conceitos.md#reprodutibilidade-e-auditoria)) | Planeado |
