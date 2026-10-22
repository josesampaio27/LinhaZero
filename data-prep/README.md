# data-prep

Gera uma grelha real para a interface (`web/public/grids/<nome>/`) a partir de:

| Camada | Fonte | Reamostragem |
| --- | --- | --- |
| `fuel` | Mapa FUMOD de modelos de combustível ([anasa30/PT_FuelModels](https://github.com/anasa30/PT_FuelModels), 100 m, UTM 29N) | vizinho mais próximo |
| `elevation` | Copernicus DEM GLO-30 (bucket público `copernicus-dem-30m`, sem credenciais) | média |
| `barrier` | OSM (Overpass): estradas principais até `secondary`, rios, canais e superfícies de água | linhas em `all_touched` (4-conexas) |
| `buildings` | OSM: centro de cada edifício, contado por célula | — |
| `village` | OSM: `place=village\|hamlet\|town` mais próximo de cada célula com edifícios, até 1 km | — |
| `canopy` (opcional) | Copernicus HRL Tree Cover Density 2018, 10 m, pelo serviço de imagens público da EEA (sem conta) | média por célula; 255 = sem dados |

## Como correr

Requisitos: Python 3.11 ou mais recente (recomendado). Também corre em Python 3.9; se o TLS do Python falhar com o
Overpass, o script repete o pedido com o `curl` do sistema (ver [ADR 0017](../docs/decisoes/0017-overpass-com-curl.md)).

```bash
cd data-prep
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python build_grid.py --bbox -8.38,41.38,-8.20,41.52 --cell 100 \
  --out ../web/public/grids/guimaraes --label "Guimarães (dados reais)"
```

- Para a grelha de 30 m: o mesmo comando com `--cell 30 --out ../web/public/grids/guimaraes-30m`. O combustível FUMOD tem 100 m e é reamostrado; as outras camadas ficam mais finas.
- Os downloads ficam em `data-prep/cache/` (cerca de 8 MB para Guimarães). Com `--offline` o script usa só a cache.
- Se uma camada falhar, o script diz qual e porquê, escreve a grelha com as restantes (a camada em falta fica a zeros) e termina com código 1.
- A grelha nova é acrescentada a `web/public/grids/index.json` e aparece logo na interface.

## Incêndios de referência

`build_reference.py` transforma um incêndio do [PT-FireSprd](https://doi.org/10.5281/zenodo.7495506) num caso de validação do motor, em `engine/test/reference/<incêndio>/`. O caso tem:

- uma grelha à volta do fogo, com o mapa FUMOD do ano (sem edifícios);
- a hora de chegada observada em cada célula;
- os intervalos L2 do PT-FireSprd: velocidade e direção medidas entre observações;
- o tempo hora a hora do arquivo do Open-Meteo, desde quatro dias antes e com a chuva, em duas séries: ERA5 e ERA5-Land. Fica em cache.

```bash
.venv/bin/python build_reference.py --fire Baiao_04092019 --ptfs ~/PT-FireSprd_v0.08 --out ../engine/test/reference
```

`build_references.py` constrói os 80 incêndios em `out/reference/` (não vai para o git) e escreve o manifesto `engine/test/reference/manifest.json`:

- **Tier A:** 2018–2021, com o mapa de combustível do próprio ano. Servem para ajustar e para testar.
- **Tier B:** 2015–2017, com o mapa de 2018, em que a cicatriz já mostra o combustível depois do fogo. Só validam e são mostrados à parte.
- **Ajuste:** tier A com pelo menos duas observações com hora.

```bash
.venv/bin/python build_references.py --ptfs ~/PT-FireSprd_v0.08            # cerca de 30 min na primeira vez
.venv/bin/python build_references.py --ptfs ~/PT-FireSprd_v0.08 --offline  # depois, só da cache
```

A 30 m (a grelha `guimaraes-30m` tem a sua própria calibração, [ADR 0064](../docs/decisoes/0064-calibracao-da-grelha-de-30-m.md)), noutra pasta e com o manifesto ao lado, para não substituir o de 100 m que está no git:

```bash
.venv/bin/python build_references.py --ptfs ~/PT-FireSprd_v0.08 --cell 30 --out out/reference-30m --manifest out/reference-30m/manifest.json
```

Sem Python local, a imagem do `Dockerfile` corre os mesmos scripts com a pasta montada:

```bash
docker build -t lz-prep data-prep
docker run --rm -v "$PWD:/repo" -v ~/PT-FireSprd_v0.08:/ptfs:ro -w /repo/data-prep --entrypoint python lz-prep \n  build_references.py --ptfs /ptfs --cell 30 --out out/reference-30m --manifest out/reference-30m/manifest.json
```

Com os casos construídos, `npm run calibrate -w engine` calibra o motor (ver [Calibração e validação](../docs/modelo/calibracao-e-validacao.md)).

`export_replay.py` põe um destes incêndios na aplicação, para o ver simulado ao lado do que ardeu:

- copia a grelha para `web/public/grids/replay-<incêndio>/`, com os perímetros observados hora a hora (`observed.geojson`);
- escreve o cenário em `web/public/scenarios/`, com a ignição observada e o tempo real (via `engine/scripts/export-replay.ts`).

```bash
.venv/bin/python export_replay.py --fire Alijo_24072019 --ptfs ~/PT-FireSprd_v0.08 --label "Alijó, 24 jul 2019"
```

## Coberto arbóreo

`canopy.py` calcula a percentagem de coberto arbóreo de cada célula. O motor usa-a para abrigar do vento a folhada e o sub-bosque (modelos F e M) no modelo de Rothermel.

- Numa grelha nova, o `build_grid.py` cria a camada.
- Numa grelha existente, acrescente-a com `python canopy.py ../web/public/grids/<nome>`.

## Parâmetros de Rothermel por combustível

`fuel_params.csv` tem os parâmetros do modelo de Rothermel de cada código FUMOD: profundidade, cargas por classe, razão superfície/volume, poder calorífico e humidade de extinção.

- **Fontes:**
  - modelos portugueses: Fernandes e Loureiro (2021), *Modelos de combustível florestal para Portugal – documento de referência*, secção 2, nas unidades da fonte;
  - NFFL 4 e NFFL 11: Anderson (1982);
  - código 238: NFFL 11, provisoriamente, sem parâmetros publicados.
- **Conversão:** `fuel_params.py` converte para as unidades do motor e é chamado pelo `build_grid.py`.
- **Grupo:** a coluna `group` diz que fator de calibração o combustível usa: F folhada, M sub-bosque, V matos, H herbáceas (os modelos dinâmicos de matos e herbáceas).
- **Grelha existente:** para acrescentar os parâmetros sem a reconstruir, use `python fuel_params.py ../web/public/grids/<nome>/header.json`.
- **Testes:** depois de mudar o CSV, atualize a cópia dos testes com `python fuel_params.py --json ../engine/test/fixtures/fuel-params.json`.

## Velocidades por combustível

`fuel_rates.csv` tem a velocidade base (m/min, sem vento nem declive) de cada código FUMOD.
**Os valores são provisórios** e têm de ser calibrados. As designações vêm da legenda `FMM_pallete.lyr`
do repositório; o código 235 existe no mapa mas não na legenda, por isso a designação está por confirmar.
Um código que não esteja no CSV fica não combustível e o script avisa.

Estas velocidades são do modelo simples, já retirado. A aplicação não as mostra (as cores e o inspetor usam o modelo de Rothermel, [ADR 0072](../docs/decisoes/0072-explicacao-do-resultado-e-mapa-pelo-modelo-da-simulacao.md)). Só marcam que códigos ardem, e o teste `engine/test/grids.test.ts` exige que isso coincida com ter parâmetros de Rothermel.
