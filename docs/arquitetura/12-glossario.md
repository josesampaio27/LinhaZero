# 12. Glossário

Siglas e termos usados na documentação, por ordem alfabética.

## Termos do domínio

| Termo | Significado |
| --- | --- |
| Ataque | Meios a combater o fogo diretamente numa zona: a partir do minuto em que chegam, o fogo anda 5 vezes mais devagar nessa zona (fator 0,2), menos com chamas altas |
| Cenário | Uma ignição, o vento, a duração e as intervenções das decisões A e B; guarda-se num ficheiro JSON ([formato](../referencia/formato-cenario.md)) |
| Corrida | Uma simulação com um vento concreto; um ensemble tem várias |
| Decisão A / B | Os dois conjuntos de intervenções que se comparam sobre o mesmo cenário |
| Editor de grelha | A página da interface onde se inspeciona a grelha e se fazem variantes (`#/grelha`) |
| Ensemble | Conjunto de corridas com o vento ligeiramente perturbado, para medir a incerteza |
| Ensemble emparelhado | Ensemble em que a corrida *k* da decisão A e a corrida *k* da decisão B têm o mesmo vento, para que a diferença seja só da decisão |
| Faixa de gestão de combustível | Faixa onde o combustível é reduzido para travar ou abrandar o fogo; no Editor de grelha, uma área pintada com outro combustível |
| Grelha | A zona dividida em células quadradas (por exemplo de 100 m), com combustível, relevo, barreiras, edifícios e lugares ([formato](../referencia/formato-grelha.md)) |
| Grelha oficial | Uma grelha publicada pelos scripts de `data-prep/`, com versão; nunca se altera no browser |
| Ignição | O ponto onde o fogo começa |
| Linha de contenção | Faixa sem combustível aberta à frente do fogo, ou uma faixa de gestão: a partir do minuto em que fica pronta, o fogo não a passa se ela for larga o bastante para as chamas |
| Proteger zona | Meios já colocados junto a casas ou a uma aldeia, à espera do fogo: a partir do minuto em que lá estão, o fogo anda 10 vezes mais devagar nessa zona (fator 0,1), menos com chamas altas |
| Snapshot meteorológico | Uma resposta de uma fonte meteorológica, guardada com a data e hora |
| Tempo de chegada | O minuto em que o fogo chega a cada célula |
| Variante de grelha | Uma grelha oficial de base mais uma lista de alterações (combustível, barreiras, velocidades, coeficientes), com um hash próprio ([formato](../referencia/formato-variante.md)) |

## Siglas

| Sigla | Significado |
| --- | --- |
| ADR | *Architecture Decision Record*: registo de uma decisão técnica ([decisões](../decisoes/README.md)) |
| AGIF | Agência para a Gestão Integrada de Fogos Rurais |
| AIPD | Avaliação de impacto sobre a proteção de dados (RGPD) |
| ANEPC | Autoridade Nacional de Emergência e Proteção Civil |
| BGRI | Base Geográfica de Referenciação de Informação, do INE |
| CAP | *Common Alerting Protocol*, formato de avisos às populações |
| CDOS | Comando Distrital de Operações de Socorro |
| CNCS | Centro Nacional de Cibersegurança |
| COS | Carta de Uso e Ocupação do Solo, da DGT |
| DGT | Direção-Geral do Território |
| EPSG:3763 | PT-TM06 / ETRS89, o sistema de coordenadas oficial de Portugal continental, em metros |
| FFMC, FWI | *Fine Fuel Moisture Code* e *Fire Weather Index*, do sistema canadiano de índices de perigo, usado pelo IPMA |
| FUMOD | Mapa nacional de modelos de combustível (Sá et al.) |
| GTF | Gabinete Técnico Florestal (municipal) |
| ICNF | Instituto da Conservação da Natureza e das Florestas |
| INE | Instituto Nacional de Estatística |
| IPMA | Instituto Português do Mar e da Atmosfera |
| NAD-AIR | Núcleo de Apoio à Decisão – Análise de Incêndios Rurais, da ANEPC |
| OIDC | OpenID Connect, protocolo de login federado |
| PITR | *Point-in-time recovery*: recuperar a base de dados para um instante passado |
| PWA | *Progressive Web App*: aplicação web que se instala e funciona sem rede |
| QNRCS | Quadro Nacional de Referência para a Cibersegurança, do CNCS |
| RCM (IPMA) | Risco Conjuntural e Meteorológico de incêndio, publicado pelo IPMA |
| RCM 41/2018 | Resolução do Conselho de Ministros sobre a segurança das redes e sistemas da Administração Pública |
| RPO, RTO | Quanto tempo de dados se pode perder, e quanto tempo pode durar a paragem, numa falha |
| SADO | Sistema de Apoio à Decisão Operacional, da ANEPC |
| SBOM | *Software Bill of Materials*: lista das dependências de uma versão |
| SIEM | Sistema de registo e análise de eventos de segurança de uma entidade |
| SMPC | Serviço Municipal de Proteção Civil |
| VDI | Ambiente de trabalho virtual, servido remotamente |
| VOST | VOST Portugal, voluntários que mantêm o fogos.pt |
| Web Worker | Processo do browser que corre código sem bloquear a interface |
