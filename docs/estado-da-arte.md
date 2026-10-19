# Estado da arte

Os simuladores de incêndio que já existem, o que a investigação diz, e onde o LinhaZero se distingue tecnicamente. As fontes estão em [Referências](bibliografia.md).

## Simuladores existentes

| Simulador | Origem | Formulação | Acesso | Notas para nós |
| --- | --- | --- | --- | --- |
| **FARSITE / FlamMap** | USFS Missoula Fire Lab (EUA) | Propagação elíptica de Huygens (FARSITE); tempo mínimo de chegada, MTT (FlamMap) | Gratuito, software de secretária | Referência mundial, baseada em Rothermel. Usado em Portugal na investigação (Benali et al.). Pede um analista treinado |
| **Wildfire Analyst** | Technosylva (Espanha/EUA) | Rothermel e outros; tempo real, ajuste a observações, análise de impacto | Comercial | Muito completo; já foi usado em Portugal em formação com apoio da ANEPC. É o "concorrente" profissional |
| **Prometheus / W.I.S.E.** | Canadá | Huygens com o sistema canadiano FBP/FWI | Gratuito | Os modelos de combustível canadianos não servem diretamente para Portugal |
| **Phoenix RapidFire, Spark** | Austrália | Huygens (Phoenix); level set (Spark, CSIRO) | Phoenix é operacional e restrito; Spark é um framework | Avaliados pelas agências australianas |
| **ELMFIRE** | Lautenberger / Berkeley (EUA) | Level set euleriano | Open source (EPL-2.0) | Usado no Pyrecast para prever a maioria dos grandes incêndios nos EUA continentais; também faz probabilidade anual de arder |
| **Cell2Fire** | Chile / Canadá (investigação operacional) | Autómato celular paralelo | Open source | Muito usado em **otimização de aceiros**, com GRASP, algoritmos genéticos e aprendizagem por reforço. Ponte direta para a investigação operacional |
| **ForeFire** | Universidade da Córsega | Front tracking a alta resolução, acoplável a modelos atmosféricos | Open source | Pensado para paisagens mediterrânicas complexas |
| **FireStation** | ADAI, Universidade de Coimbra | Propagação em relevo complexo com campo de vento | Investigação | Trabalho português de referência (Lopes, Cruz, Viegas) |
| **CFD (WFDS, FIRETEC)** | NIST / Los Alamos | Física completa | Investigação | Demasiado lento para decisão em minutos |

**Em Portugal**, a ANEPC tem o **NAD-AIR** (Núcleo de Apoio à Decisão – Análise de Incêndios Rurais), com analistas e uma plataforma webGIS própria ("FEB Monitorização"). O NAD-AIR faz análises de perigo e de comportamento potencial a 3 dias com as previsões e o FWI do IPMA, e cartografa a progressão de incêndios em curso. **O espaço livre não é "mais um simulador nacional": é levar a comparação de decisões aos primeiros minutos, ao nível local, com logística e incerteza explícitas.** O LinhaZero deve ser apresentado como complemento ao NAD-AIR, não como alternativa.

## O que a investigação diz e que vamos usar

- **A incerteza nos dados de entrada domina.** Benali et al. (2017) mostraram, com o FARSITE em grandes incêndios portugueses, que o vento, a atribuição de modelos de combustível e a hora e local da ignição têm grande impacto na precisão. Mostraram também que **calibrar parâmetros com incêndios passados** melhora as previsões de forma contínua.
- **Mapas de probabilidade** a partir de centenas de corridas perturbadas são úteis em contexto operacional (Benali et al., 2016, "Probabilistic fire spread forecast as a management tool in an operational setting").
- **O vento ajustado ao relevo importa** em terreno acidentado. O WindNinja (USFS) é a referência: modelo de vento consistente em massa, com resolução de dezenas a centenas de metros.
- **A otimização de intervenções guiada por simulação** já tem literatura madura (colocação de aceiros com o Cell2Fire, programação inteira mista para priorizar tratamentos de combustível).
- **Emuladores de aprendizagem automática** (redes espácio-temporais e modelos de difusão treinados sobre simuladores físicos) já reproduzem tempos de chegada numa única passagem. São promissores para ensembles grandes, mas pouco explicáveis; ficam como acelerador futuro, não como motor principal.

## Onde nos diferenciamos tecnicamente

| # | Diferença | Estado |
| --- | --- | --- |
| 1 | **Ensemble emparelhado para comparar decisões.** As decisões A e B correm com as mesmas perturbações, o que permite dizer *"B é melhor em 27 de 30 cenários; diferença mediana de 120 edifícios (intervalo de 80% entre 40 e 190)"*. Os simuladores existentes dão mapas de probabilidade para um cenário; não comparam decisões com estatística apropriada ([Incerteza](modelo/incerteza.md)) | Feito, para edifícios e área ardida |
| 2 | **Viabilidade logística.** Cada intervenção tem um meio associado, com tempo de deslocação pela rede viária e ritmo de construção da linha. O motor usa o momento em que a linha fica *efetivamente pronta*, não o momento que o utilizador desejou ([Intervenções e meios](modelo/propagacao.md#intervenções-e-meios-planeado)) | Hackathon |
| 3 | **Explicação do resultado.** O caminho crítico do fogo até cada aldeia e a decomposição da velocidade em fatores: *"o fogo chega à escola por este vale; 60% da velocidade deve-se ao vento"* | Hackathon |
| 4 | **Corte mínimo como sugestão de linha.** Uma linha de contenção é, em grafo, um corte entre a ignição e os ativos a proteger; um corte mínimo ponderado propõe o "terceiro caminho". Ligação direta à investigação operacional do DPS da UMinho | Planeado |
| 5 | **Calibração regional contínua**, a partir das áreas ardidas oficiais do ICNF e das deteções de satélite (VIIRS/MODIS via NASA FIRMS e EFFIS) ([Calibração](modelo/calibracao-e-validacao.md)) | Planeado |
| 6 | **Funciona sem rede.** O motor corre no browser do portátil do posto de comando; a API só acrescenta dados em tempo real e registo ([Implantação](arquitetura/07-implantacao.md#funcionamento-sem-rede)) | Feito no portátil; PWA planeada |
