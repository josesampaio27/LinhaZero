# 1. Introdução e objetivos

O que o LinhaZero faz, o que já existe, onde queremos chegar e que qualidades pesam mais nas decisões.

## O que faz

O LinhaZero compara duas decisões de combate sobre o mesmo cenário de incêndio e devolve métricas de impacto com incerteza: área ardida, edifícios atingidos, hora de chegada a cada lugar, e em quantos cenários de vento cada decisão é melhor. A pergunta a que responde é a de quem coordena um incêndio rural nos primeiros minutos: *"se eu tomar a decisão A ou a decisão B, o que acontece ao fogo nas próximas horas?"*

Na prevenção, responde à mesma pergunta sobre o território: no Editor de grelha desenha-se uma alteração (por exemplo uma faixa de gestão de combustível) e compara-se a grelha com e sem ela, *"B poupa 163 edifícios · B é melhor em 30 de 30 cenários"* ([ADR 0025](../decisoes/0025-variantes-de-grelha.md)). O mesmo editor deixa inspecionar o que a grelha diz em cada ponto: combustível, velocidade, relevo, barreiras, edifícios e lugar.

## O que já existe (feito)

- Motor de tempo mínimo de chegada em TypeScript (Dijkstra sobre grelha), que corre no próprio browser.
- Interface React/MapLibre com dois mapas sincronizados, um por decisão.
- Ensemble de vento **emparelhado**: o painel diz em quantos dos 30 cenários cada decisão é melhor.
- Editor de grelha: inspecionar cada ponto, fazer variantes (combustível, barreiras, velocidades, coeficientes) e compará-las com a grelha oficial.
- Pipeline de dados reais (FUMOD, Copernicus DEM, OpenStreetMap) e a grelha de Guimarães, da cidade à Penha.

## Para onde vamos

1. **Uma arquitetura simples, de quatro peças:** a interface, com o motor a correr no browser; uma única API, que recolhe os dados externos e guarda cenários e simulações; uma base de dados PostgreSQL; e os scripts de preparação de dados, que correm fora de linha. Ver [Estratégia de solução](04-estrategia.md).
2. **Um modelo físico melhor, no motor que já temos:** Rothermel com os modelos de combustível portugueses, vento ajustado ao relevo, humidade, calibração com incêndios passados e logística de meios. Ver [Modelo de propagação](../modelo/propagacao.md).
3. **Dados versionados e reprodutíveis** (planeado): cada simulação vai registar a versão exata, com hash, da grelha, do motor, dos parâmetros, das opções de incerteza e do tempo meteorológico. Ver [Conceitos transversais](08-conceitos.md#reprodutibilidade-e-auditoria).
4. **Um caminho claro para produção:** para várias entidades usarem a ferramenta ao mesmo tempo numa intranet do Estado faltam identidade e separação entre entidades, reprodutibilidade verificável, adaptação à intranet, redundância e conformidade. Estimamos 2 a 3 meses, sem mudar a arquitetura. Ver [Do protótipo à produção](../plano/caminho-para-producao.md).

## Objetivos de qualidade

Por ordem de prioridade. Quando duas qualidades chocam, ganha a de cima. Os cenários de medida estão em [Requisitos de qualidade](10-qualidade.md).

| # | Qualidade | Em concreto |
| --- | --- | --- |
| 1 | Compreensível para quem decide | Um comandante percebe a comparação em menos de um minuto, sem formação, em português claro |
| 2 | Funciona sem rede | A comparação corre no portátil sem internet e com a API desligada |
| 3 | Rápida | Uma comparação com incerteza demora menos de 10 s no portátil de referência das entidades |
| 4 | Reprodutível e auditável | O mesmo cenário, com as mesmas versões, dá o mesmo resultado, e fica registado quem simulou o quê |
| 5 | Segura entre entidades | Nenhuma entidade vê os cenários de outra, a não ser que partilhem o mesmo incidente |

## Partes interessadas

Os utilizadores e o que cada um espera estão na [proposta do desafio](../proposta-desafio.md#para-quem). Do lado técnico, contam também:

| Quem | O que espera da arquitetura |
| --- | --- |
| Equipas de informática das entidades | Pouca coisa para instalar e operar, sem dependências da internet, compatível com as regras da intranet |
| Encarregados de proteção de dados e de segurança | RGPD, QNRCS e registo de auditoria (ver [Conceitos transversais](08-conceitos.md#segurança-e-conformidade)) |
| Universidade do Minho e Laboratório da Paisagem | Um motor que se possa calibrar e validar com incêndios reais |
| A equipa | Pouca operação, uma linguagem, testes que apanham regressões |
