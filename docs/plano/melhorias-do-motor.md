# Melhorias do motor: plano por etapas

Este plano diz o que melhorar no motor de propagação, por que ordem, e o que cada passo traz. A etapa A está **feita** ([ADR 0072](../decisoes/0072-explicacao-do-resultado-e-mapa-pelo-modelo-da-simulacao.md)); as etapas B a D estão **planeadas**.

## Âmbito

- **Só a grelha de 100 m** (`guimaraes`), a que a aplicação abre. A grelha de 30 m fica de fora deste plano.
- **A calibração fica no fim.** Cada recalibração e cada validação completa demora horas de cálculo (`npm run calibrate -w engine` leva cerca de 70 minutos, [Validação, resumo](../modelo/validacao-resumo.md)). Recalibrar depois de cada mudança seria desperdício: o motor muda várias vezes até lá. Durante as etapas A a C, cada mudança física é testada com a calibração em uso, e só é adotada se não piorar os incêndios que não foram usados no ajuste (a regra da [ADR 0053](../decisoes/0053-validacao-e-calibracao-com-o-pt-firesprd.md)).
- **Números só com origem.** Os pontos de partida vêm de `landing/src/data/site-data.json` (motor de 21 de outubro de 2026), das ADRs e de `engine/src/params.ts`.

## Ponto de partida

- **Acerto:** Sørensen de 0,40 nos 34 incêndios de 2018–2021, e também nos 27 que não entraram no ajuste ([Validação, resumo](../modelo/validacao-resumo.md)).
- **Calibração em uso:** velocidade ×0,5 e vento ×2,5 ([`engine/src/calibration.ts`](../../engine/src/calibration.ts)). Fatores tão longe de 1 indicam física que falta e que a calibração compensa.
- **Pior erro medido:** nas corridas rápidas (acima de 15 m/min), o motor fez cerca de 0,67 da velocidade observada na revisão do motor ([ADR 0058](../decisoes/0058-revisao-do-motor.md)). Os fogos reais são mais alongados do que o modelo dá ([ADR 0057](../decisoes/0057-fogo-sem-combate-e-corridas-rapidas.md)).
- **Valores provisórios:** limites da descarga aérea, largura e segurança das linhas, focos secundários, humidade do combustível vivo (marcados `PROVISÓRIO` em `engine/src/params.ts`, `engine/src/scenario.ts` e `engine/src/moisture.ts`).
- **O mapa mostrava outro modelo:** as cores do combustível e a "velocidade base" do inspetor vinham da tabela do modelo simples, já retirado. Resolvido no M2.

## Visão geral

| Etapa                           | Marco                                | O que melhora                                                       | Esforço          |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------------- | ---------------- |
| A. Mais claro e mais seguro     | M1. Explicar o resultado             | O utilizador vê por onde e porquê o fogo chega a cada lugar         | Médio            |
|                                 | M2. Um só modelo no ecrã             | O mapa mostra o que a simulação usa                                 | Pequeno          |
|                                 | M3. Validação automática             | Os números publicados não ficam desatualizados                      | Pequeno          |
| B. Física e dados               | M4. Forma do fogo e matos            | Corridas rápidas e fogos mais alongados                             | Médio            |
|                                 | M5. Humidade do combustível          | Anos de seca e primaveras secas                                     | Médio            |
|                                 | M6. Dados de entrada a 100 m         | Estradas e rios que seguram ou cedem; fogo de copas onde pode haver | Médio            |
|                                 | M7. Faúlhas de longo alcance         | Os saltos de quilómetros dos grandes incêndios                      | Médio            |
|                                 | M8. Vento no relevo                  | Vales e cumeadas; ajuda as corridas rápidas                         | Grande           |
| C. Meios e sugestões (opcional) | M9. Meios com deslocação             | Quando cada meio chega e quanto constrói                            | Grande           |
|                                 | M10. Sugerir uma terceira decisão    | Uma alternativa proposta pelo simulador                             | Médio            |
| D. Calibração e validação       | M11. Recalibração da grelha de 100 m | Fatores mais perto da física; acerto final                          | Grande (cálculo) |
|                                 | M12. Valores provisórios             | Ações de combate com valores medidos                                | Médio            |
|                                 | M13. Validação completa e publicação | Números finais na ficha, no site e na documentação                  | Médio (cálculo)  |

O esforço é relativo, sem datas.

## Etapa A: o que já existe, mais claro e mais seguro

Sem mudar a física nem a calibração. **Estado: feito** ([ADR 0072](../decisoes/0072-explicacao-do-resultado-e-mapa-pelo-modelo-da-simulacao.md)).

### M1. Explicar o resultado

- **O que melhora:** o utilizador vê o caminho do fogo até cada aldeia e o que o fez andar depressa: _"o fogo chega a esta aldeia por este vale; a maior parte da velocidade deve-se ao vento"_. Responde à crítica de que não se conseguia perceber bem a propagação, e serve a primeira qualidade da arquitetura, ser compreensível para quem decide ([Objetivos](../arquitetura/01-introducao-e-objetivos.md#objetivos-de-qualidade)).
- **Trabalho:**
  - guardar, no Dijkstra, a célula de onde o fogo chegou a cada célula (`engine/src/spread-rothermel.ts`);
  - reconstruir o caminho crítico da ignição a cada lugar, e decompor a velocidade ao longo dele em combustível, vento, declive e humidade;
  - mostrar o caminho no mapa e a decomposição no inspetor e no painel de comparação (`web/src/components/CellInspector.tsx`, `ComparisonPanel.tsx`).
- **Como se mede:** testes do motor (o caminho liga a ignição à célula e soma o tempo de chegada); o resultado das simulações não muda.
- **Depende de:** nada. Já previsto em [Modelo de propagação](../modelo/propagacao.md#explicação-do-resultado-planeado).

### M2. Um só modelo no ecrã

- **O que melhora:** as cores do combustível e a velocidade do inspetor passam a vir do modelo de Rothermel, o que a simulação usa. Acaba a ressalva da ficha técnica.
- **Trabalho:**
  - calcular, por combustível, a velocidade de Rothermel em condições de referência (sem vento nem declive, humidade de verão) e usá-la nas cores (`web/src/lib/render.ts`) e no inspetor;
  - decidir se uma célula arde pelos parâmetros de Rothermel, e não por `baseRate > 0` (`engine/src/grid.ts`, `spread-rothermel.ts`);
  - deixar de usar `data-prep/fuel_rates.csv` fora dos testes do modelo antigo.
- **Como se mede:** a legenda do combustível bate com a velocidade de Rothermel; as simulações dão exatamente o mesmo resultado.
- **Depende de:** nada.

### M3. Validação automática

- **O que melhora:** os números da ficha técnica, do site e da documentação deixam de ficar para trás em silêncio, como aconteceu antes desta revisão.
- **Trabalho:**
  - um teste que falha quando `landing/src/data/site-data.json` não corresponde à calibração em uso (identificador e valores de `calibration.ts`) ou às perturbações da incerteza;
  - um único comando documentado para o regenerar (`engine/scripts/landing-data.ts`).
- **Como se mede:** mudar um valor da calibração faz o teste falhar até o ficheiro ser regenerado.
- **Depende de:** nada.

## Etapa B: física e dados de entrada

Cada mudança é testada nos incêndios do PT-FireSprd **com a calibração em uso** e só é adotada se não piorar os incêndios fora do ajuste. A recalibração fica para a etapa D.

### M4. Forma do fogo com vento forte e matos

- **O que melhora:** o maior erro medido, as corridas rápidas, e a forma dos fogos: cabeça mais rápida e flancos mais lentos.
- **Trabalho:** os dois primeiros candidatos da [ADR 0057](../decisoes/0057-fogo-sem-combate-e-corridas-rapidas.md):
  - uma razão comprimento/largura da elipse diferente com vento forte (hoje até 8, como no BehavePlus; `engine/src/rothermel.ts`);
  - o modelo empírico de matos de Anderson et al. (2015) nos combustíveis do grupo dos matos (V), em vez do Rothermel. Precisa do artigo.
- **Como se mede:** a razão simulada/observada nas corridas rápidas sobe, sem piorar o Sørensen dos incêndios fora do ajuste.
- **Depende de:** M3, para os números novos ficarem registados.

### M5. Humidade do combustível

- **O que melhora:** o fogo responde a anos de seca e a primaveras secas; sai uma tabela provisória.
- **Trabalho:**
  - humidade do combustível vivo por satélite, em vez da curva típica por mês (`LIVE_MOISTURE_BY_MONTH` em `engine/src/moisture.ts`);
  - voltar a testar, com um protocolo registado antes, o FFMC ou o modelo de Nelson para o combustível morto, quando houver histórico diário. O FFMC já foi testado uma vez e rejeitado ([Validação, resumo](../modelo/validacao-resumo.md)).
- **Como se mede:** o acerto nos incêndios de anos secos; não piorar os restantes.
- **Depende de:** nada; a ingestão de dados novos pode ir para `backend/src/LinhaZero.Ingest`.

### M6. Dados de entrada a 100 m

- **O que melhora:** estradas e rios que seguram ou cedem conforme a sua largura real, e fogo de copas onde as árvores o permitem.
- **Trabalho** (`data-prep/build_grid.py`, `data-prep/fuel_params.csv`):
  - afinar o combustível FUMOD com a Carta de Uso e Ocupação do Solo (COS, DGT) e o coberto arbóreo que a grelha já tem;
  - largura medida de estradas e rios, em vez da largura por classe do OpenStreetMap (hoje: autoestrada 30 m, estrada nacional 10 m, rio 15 m);
  - altura e densidade das copas a partir de produtos de satélite de altura do coberto, em vez de valores típicos por povoamento;
  - confirmar a designação do código FUMOD 235 com os autores.
- **Como se mede:** o acerto nos incêndios atravessados por estradas e rios; testes da preparação de dados.
- **Depende de:** nada.

### M7. Faúlhas de longo alcance

- **O que melhora:** os saltos de quilómetros, típicos da casca de eucalipto nos grandes incêndios portugueses. Hoje os focos ficam a dezenas ou centenas de metros (Sardoy et al. 2008, `engine/src/spotting.ts`).
- **Trabalho:** uma segunda distribuição de distâncias, de longo alcance, para os combustíveis de eucaliptal, só nas simulações com incerteza, como os focos atuais.
- **Como se mede:** a área que arde do outro lado de barreiras largas, nos incêndios que as saltaram.
- **Depende de:** M6 ajuda (copas e eucaliptal mais bem mapeados).

### M8. Vento no relevo

- **O que melhora:** o vento muda nos vales e nas cumeadas, por exemplo à volta da Penha. Hoje é o mesmo em toda a zona em cada hora. Deve também ajudar as corridas rápidas (é o terceiro candidato da ADR 0057).
- **Trabalho:**
  - um solver de vento consistente em massa sobre o relevo da grelha, ao estilo do WindNinja, escrito por nós ([Modelo de propagação](../modelo/propagacao.md#evolução-planeado));
  - calculado por direção e velocidade de vento e guardado por grelha;
  - o motor passa a ler o vento por célula.
- **Como se mede:** comparação com estações do IPMA em vales e cumeadas; acerto nos incêndios de relevo acidentado.
- **Depende de:** M4, para separar o efeito da forma do fogo do efeito do vento.

## Etapa C: meios e sugestões (opcional)

Produto construído sobre o motor. Pode avançar em paralelo com a etapa B ou ficar para depois.

### M9. Meios com deslocação

- **O que melhora:** a linha fica pronta quando os meios chegam e a constroem, e não num minuto escrito à mão. Uma linha que não chega a tempo aparece a vermelho.
- **Trabalho:** meios com base, velocidade na rede viária do OpenStreetMap e ritmo de construção por combustível e declive; linhas construídas por troços ao longo do tempo (desenho em [Modelo de propagação](../modelo/propagacao.md#intervenções-e-meios-planeado)).
- **Como se mede:** testes do motor com tempos de chegada conhecidos; revisão com quem comanda.
- **Depende de:** nada.

### M10. Sugerir uma terceira decisão

- **O que melhora:** o simulador propõe uma alternativa às decisões A e B.
- **Trabalho:** linhas candidatas perpendiculares ao caminho crítico (M1), avaliadas pelo motor; mais tarde, um corte mínimo no grafo de tempos de chegada ([Modelo de propagação](../modelo/propagacao.md#sugerir-um-terceiro-caminho-planeado)).
- **Como se mede:** a sugestão protege mais edifícios do que as decisões desenhadas, nos cenários de demonstração.
- **Depende de:** M1; M9 torna as sugestões realistas.

## Etapa D: calibração e validação

No fim, de uma vez, com o motor já completo. São os passos que mais tempo de cálculo levam.

### M11. Recalibração da grelha de 100 m

- **O que melhora:** fatores de calibração mais perto da física, e o acerto final do motor novo.
- **Trabalho:** recalibrar com o protocolo das ADRs [0068](../decisoes/0068-calibracao-por-cobertura-30-m.md) e [0069](../decisoes/0069-recalibracao-da-grelha-de-100-m.md): protocolo registado antes de pontuar, validação cruzada em 5 partes, incêndios deixados de fora.
- **Como se mede:** a calibração nova só é adotada se passar a regra. Objetivo: velocidade e vento mais perto de 1 do que ×0,5 e ×2,5, sem perder acerto.
- **Depende de:** etapa B.

### M12. Valores provisórios

- **O que melhora:** as ações de combate passam a ter valores medidos, e a comparação entre A e B fica mais fiável.
- **Trabalho:** calibrar os valores marcados `PROVISÓRIO`:
  - limites da descarga aérea (2000 e 4000 kW/m) e a sua duração (água 20 min, retardante 2 h);
  - a curva com que uma linha segura ou cede, e a largura das linhas por omissão;
  - a probabilidade e o atraso dos focos secundários.

  Com os incêndios do PT-FireSprd onde o combate é conhecido, e com a opinião de quem combate (ANEPC, corpos de bombeiros).

- **Como se mede:** cada valor fica com a sua origem registada numa ADR.
- **Depende de:** M11.

### M13. Validação completa e publicação

- **O que melhora:** os números finais ficam publicados e coerentes em todo o lado.
- **Trabalho:**
  - repetir o tier A, o tier B (incêndios de 2015–2017, ainda não repetido com o motor de hoje) e a verificação do mapa de cenários, com o motor final;
  - regenerar `landing/src/data/site-data.json` (o teste do M3 obriga);
  - atualizar a ficha técnica, as páginas `/motor` e `/calibracao`, e a [documentação do modelo](../modelo/o-motor-explicado.md).
- **Como se mede:** o teste do M3 passa; nenhum número publicado sem origem.
- **Depende de:** M11 e M12.
