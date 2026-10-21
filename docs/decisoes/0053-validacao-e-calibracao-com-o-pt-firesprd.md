# ADR 0053: Validação e calibração com o PT-FireSprd

- Estado: aceite; a calibração foi revista e confirmada pela [ADR 0054](0054-calibracao-por-intervalo-e-por-grupo.md)
- Data: 2026-10-19

## Decisão

- **Validação:** o motor é comparado com nove incêndios reais do PT-FireSprd, os mais próximos de Guimarães, em `engine/test/reference/`. Cada caso parte da zona de ignição observada, com o tempo real hora a hora (ERA5, pelo arquivo do Open-Meteo) e o mapa FUMOD do ano do fogo. Um teste na CI guarda o acerto (Sørensen) de cada incêndio.
- **Barreiras:** as autoestradas, as estradas nacionais e os rios passam a ceder conforme a largura, como as estradas da [ADR 0052](0052-intensidade-linhas-que-cedem-e-focos-secundarios.md). Só as superfícies de água ficam absolutas.
- **Calibração:** o modelo de Rothermel corre na interface e no servidor com `PT_CALIBRATION`:
  - `rosAdj` 0,5;
  - `windAdj` 2,5;
  - `holdWidthPerFlame` 5.

  Foi ajustada em sete fogos de 2019–2020. Uma variante de grelha pode mudar qualquer destes valores. Os valores por omissão do motor ficam físicos, e os testes contra o BehavePlus não mudam.

## Porquê

- **Barreiras:** o fogo de Alijó (2019) atravessou a A4 e o rio Tinhela; com estas linhas como barreiras absolutas, nenhuma simulação o podia reproduzir.
- **Ganho da calibração:** sobe o acerto médio de 0,33 para 0,46 nos fogos ajustados e para 0,39 num fogo deixado de fora. Os valores são estáveis entre as validações cruzadas.
- **Leitura física:** o fogo real é combatido (mais lento), o vento local é mais forte do que o do ERA5, e as faixas e estradas são galgadas por calor radiante e faúlhas muito antes de a chama ter a largura delas.

## Consequências

- **Fogos mais pequenos:** em Guimarães, os fogos do Rothermel ardem cerca de 30% menos e são mais alongados.
- **Combate contado duas vezes:** a calibração já inclui o combate típico, por isso um "Ataque" desenhado por cima conta-o em parte duas vezes. Comparar decisões continua válido; a área absoluta é indicativa.
- **Poucos fogos:** sete fogos são poucos. Os dois fogos de 2016 do distrito de Braga, que não entram no ajuste, dão resultados mistos (um piora, outro melhora). Mais incêndios do Minho são a próxima prioridade.

## Alternativas consideradas

- **Não calibrar:** deixaria o modelo a falhar a direção de fogos como os de Alijó e Baião.
- **Fatores por modelo de combustível:** com sete fogos ficavam sobreajustados.
- **Campos "não combustíveis" do FUMOD como erva:** testado, piorou o acerto.
