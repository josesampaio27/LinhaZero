# Decisões técnicas (ADR)

Cada decisão técnica importante tem um registo próprio (*Architecture Decision Record*), no formato [MADR](https://adr.github.io/madr/) simplificado: o que se decidiu, porquê, e que alternativas se puseram de lado.

## Regras

- **Um ficheiro por decisão**, com o nome `NNNN-titulo-com-hifens.md`. O número é sequencial e nunca se reutiliza.
- **Uma decisão aceite não se reescreve.** Se mudar, escreve-se uma decisão nova, que diz "substitui a ADR NNNN", e a antiga passa ao estado `substituída pela ADR MMMM`. Correções de texto e de ligações são permitidas.
- **Estados:** `proposta`, `aceite`, `rejeitada`, `obsoleta`, `substituída pela ADR NNNN`.
- **Só decisões que custam a desfazer**, ou que alguém vai querer perceber mais tarde: estrutura, contratos de dados, regras do modelo, escolhas de tecnologia.

## Modelo

```markdown
# ADR NNNN: Título curto, de preferência "Usar X para Y"

- Estado: proposta
- Data: AAAA-MM-DD

## Decisão

O que se decidiu, numa ou duas frases.

## Porquê

As razões, com números quando os houver.

## Alternativas consideradas

O que se pôs de lado, e porquê.
```

## Índice

| Nº | Decisão | Estado | Data |
| --- | --- | --- | --- |
| [0001](0001-raiz-do-monorepo.md) | Raiz do monorepo | aceite | 2026-10-16 |
| [0002](0002-formato-dos-binarios.md) | Formato dos binários | aceite | 2026-10-16 |
| [0003](0003-rasterizacao-de-linhas.md) | Rasterização de linhas | aceite | 2026-10-16 |
| [0004](0004-intervencoes-sobrepostas.md) | Intervenções sobrepostas | aceite | 2026-10-16 |
| [0005](0005-momento-em-que-se-avalia-uma-intervencao.md) | Momento em que se avalia uma intervenção | aceite | 2026-10-16 |
| [0006](0006-precisao-dos-tempos.md) | Precisão dos tempos | aceite | 2026-10-16 |
| [0007](0007-ensemble.md) | Ensemble | aceite | 2026-10-16 |
| [0008](0008-ferramenta-de-desenho.md) | Ferramenta de desenho | aceite | 2026-10-16 |
| [0009](0009-onde-se-desenha.md) | Onde se desenha | aceite | 2026-10-16 |
| [0010](0010-geometrias-guardadas-em-metros.md) | Geometrias guardadas em metros | aceite | 2026-10-16 |
| [0011](0011-mapa-de-fundo-offline.md) | Mapa de fundo offline | aceite | 2026-10-16 |
| [0012](0012-logica-do-proteger-zona.md) | Lógica do "Proteger zona" | aceite | 2026-10-16 |
| [0013](0013-cenarios-e-scenario.md) | Cenários e `?scenario=` | aceite | 2026-10-16 |
| [0014](0014-vista-de-incerteza.md) | Vista de incerteza | aceite | 2026-10-16 |
| [0015](0015-ensemble-emparelhado.md) | Ensemble emparelhado | aceite | 2026-10-17 |
| [0016](0016-zona-real.md) | Zona real | aceite | 2026-10-16 |
| [0017](0017-overpass-com-curl.md) | Overpass com curl | aceite | 2026-10-16 |
| [0018](0018-edificios-em-celulas-nao-ardiveis.md) | Edifícios em células não ardíveis | aceite | 2026-10-16 |
| [0019](0019-etiquetas-no-mapa.md) | Etiquetas no mapa | aceite | 2026-10-16 |
| [0020](0020-ficheiros-de-cenario-tratados-no-motor.md) | Ficheiros de cenário tratados no motor | aceite | 2026-10-17 |
| [0021](0021-lugares-salvos-na-mensagem-principal.md) | Lugares salvos na mensagem principal | aceite | 2026-10-17 |
| [0022](0022-arquitetura-de-quatro-pecas.md) | Arquitetura de quatro peças | substituída pela ADR 0042 | 2026-10-17 |
| [0023](0023-api-em-typescript.md) | API em TypeScript | substituída pela ADR 0042 | 2026-10-17 |
| [0024](0024-motor-continua-em-typescript.md) | Motor continua em TypeScript | aceite | 2026-10-17 |
| [0025](0025-variantes-de-grelha.md) | Variantes de grelha, editadas numa página própria | aceite | 2026-10-17 |
| [0026](0026-ingestao-a-pedido-com-cache-em-ficheiro.md) | Ingestão a pedido com cache em ficheiro | substituída pela ADR 0030 | 2026-10-17 |
| [0027](0027-estacao-ipma-antes-do-modelo-ate-25-km-e-3-h.md) | Estação IPMA antes do modelo, até 25 km e 3 h | aceite | 2026-10-17 |
| [0028](0028-cache-em-bruto-e-modo-offline.md) | Cache em bruto e modo offline | aceite | 2026-10-17 |
| [0029](0029-vento-unico-no-motor-previsao-so-informativa.md) | Vento único no motor; previsão só informativa | substituída pela ADR 0050 | 2026-10-17 |
| [0030](0030-ingestao-agendada-com-snapshots-em-postgres.md) | Ingestão agendada com snapshots em Postgres | aceite | 2026-10-17 |
| [0031](0031-workers-do-motor-em-node-nao-em-rust.md) | Workers do motor em Node, não em Rust | aceite | 2026-10-17 |
| [0032](0032-sem-armazenamento-de-objetos.md) | Sem armazenamento de objetos | aceite | 2026-10-17 |
| [0033](0033-postgres-sem-postgis.md) | Postgres sem PostGIS | aceite | 2026-10-17 |
| [0034](0034-server-sent-events-em-vez-de-signalr.md) | Server-Sent Events em vez de SignalR | aceite | 2026-10-17 |
| [0035](0035-sem-redis.md) | Sem Redis | aceite | 2026-10-17 |
| [0036](0036-contratos-por-exemplos-partilhados.md) | Contratos por exemplos partilhados | aceite | 2026-10-17 |
| [0037](0037-rede-de-pontos-do-open-meteo-por-dominio.md) | Rede de pontos do Open-Meteo por domínio | aceite | 2026-10-17 |
| [0038](0038-ingestao-singleton-com-advisory-lock-numa-ligacao-dedicada.md) | Ingestão singleton com advisory lock numa ligação dedicada | aceite | 2026-10-17 |
| [0039](0039-um-job-de-cada-vez-por-worker.md) | Um job de cada vez por worker | aceite | 2026-10-17 |
| [0040](0040-grelha-lida-por-job-hash-do-cabecalho-e-das-camadas.md) | Grelha lida por job, hash do cabeçalho e das camadas | substituída em parte pela ADR 0043 | 2026-10-17 |
| [0041](0041-cliente-nats-oficial-na-api-nats-net.md) | Cliente NATS oficial na API (NATS.Net) | aceite | 2026-10-17 |
| [0042](0042-poucos-servicos-api-e-ingestao-em-net-workers-do-motor-postgresql-e-nats.md) | Poucos serviços: API e ingestão em .NET, workers do motor, PostgreSQL e NATS | aceite | 2026-10-17 |
| [0043](0043-um-so-hash-de-grelha-hashgrid.md) | Um só hash de grelha: `hashGrid` | aceite | 2026-10-17 |
| [0044](0044-variantes-de-grelha-tambem-no-servidor.md) | Variantes de grelha também no servidor | aceite | 2026-10-17 |
| [0045](0045-um-comando-arranca-tudo-interface-em-contentor.md) | Um comando arranca tudo, com a interface em contentor | aceite | 2026-10-18 |
| [0046](0046-api-com-controladores-e-openapi.md) | API com controladores, pastas por responsabilidade e OpenAPI | aceite | 2026-10-18 |
| [0047](0047-clientes-http-tipados-modelos-json-e-dapper.md) | Clientes HTTP tipados, modelos JSON e Dapper | aceite | 2026-10-18 |
| [0048](0048-rothermel-com-elipse-ao-lado-do-modelo-legado.md) | Rothermel com elipse, ao lado do modelo legado | aceite | 2026-10-19 |
| [0049](0049-coberto-arboreo-do-copernicus-para-o-abrigo-do-vento.md) | Coberto arbóreo do Copernicus para o abrigo do vento | aceite | 2026-10-19 |
| [0050](0050-humidade-do-combustivel-e-tempo-hora-a-hora-no-motor.md) | Humidade do combustível e tempo hora a hora no motor | aceite | 2026-10-19 |
| [0051](0051-dezasseis-vizinhos-no-modelo-de-rothermel.md) | Dezasseis vizinhos no modelo de Rothermel | substituída pela 0058 (32 direções com setores) | 2026-10-19 |
| [0052](0052-intensidade-linhas-que-cedem-e-focos-secundarios.md) | Intensidade, linhas que cedem e focos secundários | aceite | 2026-10-19 |
| [0053](0053-validacao-e-calibracao-com-o-pt-firesprd.md) | Validação e calibração com o PT-FireSprd | aceite; calibração revista pela 0054 | 2026-10-19 |
| [0054](0054-calibracao-por-intervalo-e-por-grupo.md) | Calibração por intervalo, por grupo de combustível e com fogos de teste | aceite | 2026-10-19 |
| [0055](0055-incerteza-calibrada-com-incendios-reais.md) | Probabilidade de arder calibrada com incêndios reais | aceite; mapa de recalibração retirado pela 0057 | 2026-10-19 |
| [0056](0056-fogo-de-copas.md) | Fogo de copas no modelo de Rothermel | aceite | 2026-10-19 |
| [0057](0057-fogo-sem-combate-e-corridas-rapidas.md) | Fogo sem combate por omissão, e o que se testou para as corridas rápidas | aceite; limite do vento revisto pela 0058 | 2026-10-19 |
| [0058](0058-revisao-do-motor.md) | Revisão do motor: direções do fogo, modelo único e correções | aceite | 2026-10-19 |
| [0059](0059-pasta-backend-com-projetos-linhazero.md) | Pasta `backend/` com projetos `LinhaZero.*` | aceite | 2026-10-19 |
| [0060](0060-tempo-em-direto-por-omissao.md) | Tempo em direto por omissão, com cada valor ajustável à mão | aceite | 2026-10-20 |
| [0061](0061-keycloak-e-sessao-no-servidor.md) | Login com Keycloak e sessão guardada pela API | aceite | 2026-10-20 |
| [0062](0062-pedidos-de-acesso-e-convites-por-email.md) | Pedidos de acesso na landing e convites por email | aceite | 2026-10-20 |
| [0063](0063-tempo-que-muda-cantos-e-estado-de-partida.md) | Passos que se recalculam quando o tempo muda, cantos, intensidade das copas e estado de partida | aceite | 2026-10-20 |
| [0064](0064-calibracao-da-grelha-de-30-m.md) | Calibração da grelha de 30 m | aceite | 2026-10-20 |
