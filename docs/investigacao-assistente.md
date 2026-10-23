# Investigação para o assistente com IA

O que a investigação publicada diz sobre pôr um modelo de linguagem dentro de uma ferramenta de apoio à decisão com
mapas, e como isso moldou o assistente do LinhaZero. O estudo é de 22 de outubro de 2026 e veio antes da
[ADR 0079](decisoes/0079-assistente-com-claude-haiku.md). O assistente que existe está descrito nessa ADR e nas
[0081](decisoes/0081-assistente-coloca-acoes-em-qualquer-sitio.md) e
[0082](decisoes/0082-assistente-explica-decisoes.md).

**Âmbito:** uma prova de conceito que chama um modelo na nuvem com uma chave de API. Ficaram de fora a regulação, a
residência dos dados na UE, os modelos locais e o alojamento em Bedrock, Vertex ou Azure.

As fontes estão em [Referências](bibliografia.md#assistente-com-ia). Os artigos marcados como pré-publicação (arXiv)
não foram revistos por pares; os números lidos só num resumo dizem-no.

## Resumo

- **Os modelos de linguagem raciocinam mal sobre mapas e grelhas.** Num teste com agentes a combater um incêndio
  (CREW-Wildfire), as equipas de modelos fizeram pior do que não fazer nada. Não devem ser eles a escolher as células de
  uma linha de contenção.
- **O que funciona é o modelo propor e um verificador exato decidir.** O LinhaZero já tem esse verificador: o motor e o
  ensemble emparelhado.
- **O melhor papel do modelo é traduzir e explicar:** passar o pedido do coordenador ("proteger X, duas equipas daqui a
  40 min") para algo estruturado, propor estratégias diferentes e explicar o resultado em português. A geometria fica
  com a aplicação.
- **O contexto espacial deve ser texto com nomes e unidades**, calculado pela aplicação: aldeias, caminhos do fogo,
  tempos de chegada, estradas. Grelhas em bruto, coordenadas e imagens do mapa funcionam pior.
- **Não encontrámos nenhum produto nem artigo** que ligue um modelo de linguagem a um simulador de incêndio para
  comparar intervenções. O espaço é novo, mas também não há provas de campo do que resulta.

## Os modelos a raciocinar sobre mapas

- **Labirintos em grelha** (pré-publicação, 2026; quatro modelos, 50 labirintos por tamanho):
  - com raciocínio passo a passo e a grelha dada como lista de vizinhos, o melhor modelo (Gemini 2.5 Flash) desce de
    0,86 de acerto em 5×5 para 0,42 em 9×9; o Claude Haiku 4.5 desce de 0,78 para 0,24;
  - com a grelha desenhada, todos ficam entre 0,08 e 0,34;
  - sem instrução para raciocinar, o Claude Haiku 4.5 acerta 0 em 5×5; com ela, 0,78.
  - Falhas típicas: atravessar paredes a direito até ao objetivo e tratar perguntas seguidas como independentes.
- **O gargalo é extrair as restrições** da representação espacial, não raciocinar sobre elas depois (TopoBench,
  pré-publicação, lido só no resumo).
- **Mapas reais** (MapEval, ICML 2025; 700 perguntas, 180 cidades, 30 modelos): nenhum passa dos 67% de acerto, todos
  a mais de 20 pontos dos humanos. O pior: distâncias, direções e rotas.
- **Mapas em imagem** (MapBench, pré-publicação): poucos modelos de visão chegam a dar respostas válidas; desvios,
  atravessar obstáculos e mau planeamento a longa distância.
- **Combate a incêndios com agentes** (CREW-Wildfire, TMLR 2025; autómato celular com declive, vento e vegetação;
  quatro sistemas com GPT-4o):
  - em "suprimir o fogo", o melhor fez −593 contra −520 de "não fazer nada"; no ambiente completo, −5572 contra −5503;
  - explorar o fogo no mapa grande e as tarefas de salvamento deram 0 em todos;
  - várias equipas cortaram a mesma árvore em vez de dividir o aceiro, e mantiveram planos já ultrapassados pelo fogo.
- **Dar factos geográficos ajuda.** Com um texto curto e com unidades construído a partir de consultas a uma base de
  dados geográfica (infraestruturas, população, terreno, tempo), um modelo previu melhor do que a referência física o
  pessoal e o orçamento diários em cinco incêndios da Califórnia (pré-publicação, 2025). Prevê quantidades, não onde
  pôr meios.

As grelhas do LinhaZero têm centenas de células de lado. Os testes mostram o modelo a degradar-se muito antes disso.

## O modelo propõe, o simulador verifica

- **O modelo como otimizador direto** (OPRO, ICLR 2024, no problema do caixeiro-viajante): empata com heurísticas
  simples em 10 cidades, perde em 20 e degrada-se muito em 50 (GPT-4 a 11,0% do ótimo contra 9,8% da heurística de
  inserção mais distante; outros modelos a 133% e 220%).
- **Com um avaliador exato funciona melhor.** No FunSearch (Nature, 2023) o modelo escreve programas e um avaliador
  automático pontua-os; encontrou heurísticas melhores do que as usadas. Heurísticas de planeamento evoluídas assim
  (pré-publicação, 2026) igualaram as de referência em vários domínios, mas não em todos.
- **O caso mais parecido com o nosso** (SimTIO, pré-publicação, 2026; semáforos e tráfego num microssimulador):
  - o simulador encontra os 10 estrangulamentos; três agentes com modelo escolhem afinações de um só parâmetro a partir
    de catálogos validados; as ações compatíveis juntam-se e voltam a simular-se; "não fazer nada" fica sempre como
    opção;
  - com 7 simulações por caso, encontrou um plano que melhora em 86,7% dos casos, contra 73,3% da procura aleatória e
    80,0% de uma heurística, **sem diferença estatisticamente significativa**.
- **A posição de consenso** (LLM-Modulo, ICML 2024): o modelo não planeia nem se verifica sozinho, mas é útil como
  fonte aproximada de conhecimento ligada a verificadores externos, num ciclo gerar, testar, criticar.

O motor do LinhaZero é rápido e determinístico e o ensemble dá uma pontuação com significado estatístico, que é a
condição destes casos de sucesso. Mas a investigação não diz que o modelo acha melhor geometria do que um método
clássico: para "onde pôr a linha para proteger X", o corte mínimo no grafo dos tempos de chegada (no
[roteiro](plano/roteiro.md)) deve ser pelo menos tão bom e muito mais barato.

## Do pedido às restrições: modelo e otimizador

- **Passar um problema escrito para um modelo matemático** é o papel do modelo de linguagem mais estudado em
  investigação operacional. O OptiMUS acerta 83,0% num conjunto de problemas de manual, mas 31,0% e 20,2% em conjuntos
  industriais (reavaliação independente, pré-publicação, 2026). Chega para fazer um rascunho que uma pessoa confirma,
  não para correr sozinho.
- **Em emergência e catástrofes** os trabalhos convergem: o modelo trata a intenção e chama ferramentas; um otimizador
  resolve. Quando o modelo resolve sozinho, esquece restrições (planeamento pós-catástrofe, TopoLLM).
- **Do lado do otimizador há precedentes em incêndios:** uma programação inteira mista escolhe a área de resposta e o
  calendário de construção da linha para a fechar antes de o fogo chegar (Wei et al., 2019); outra coloca o combate em
  células da grelha, com os caminhos e tempos de chegada como resultado (Belval, Wei e Bevers).
- **Aprendizagem automática para aceiros** é sobretudo aprendizagem por reforço sobre o Cell2Fire, para prevenção e em
  grelhas até 40×40. O Serviço Florestal dos EUA usa um modelo estatístico de "locais potenciais de controlo" (estradas,
  cumeadas, barreiras) que acerta 69% dos perímetros finais. **Não encontrámos nenhum método com modelo de linguagem
  para colocar aceiros ou linhas de contenção.**

A divisão de trabalho que daqui sai:

1. **Modelo:** do pedido a uma especificação (o que proteger, meios e horas de chegada, onde apoiar a linha, zonas
   proibidas), que o coordenador confirma.
2. **Otimizador:** toda a geometria, restrita às células onde os meios chegam antes do fogo.
3. **Motor e ensemble:** o veredicto de cada candidato, contra não fazer nada e contra o desenho do utilizador.
4. **Modelo:** explicar o resultado e propor variantes qualitativas ("a linha falha com vento de noroeste; apoiar na
   cumeada a norte").
5. **Coordenador:** escolhe, altera ou rejeita.

## Quem já usa modelos de linguagem em incêndios e emergência

- **WildfireGPT** (Argonne, 2024–2025) é o único sistema de incêndios bem documentado. É um assistente de conversa
  sobre risco a longo prazo, não sobre tática:
  - três agentes: um que confirma o perfil e o local, um que propõe um plano de análise que o utilizador pode mudar, e
    um que vai buscar dados e literatura por ferramentas, não à memória do modelo;
  - avaliado com especialistas em 10 casos (relevância de 96,67 a 100%); o GPT-4 como juiz só concordou com eles entre
    63 e 75% das vezes;
  - falhas: quando pediram o cenário climático RCP 8.5 respondeu com o 4.5, o único disponível, sem dizer; citou
    estudos de outras regiões; extrapolou para lá dos dados; respostas longas e sem prioridades.
- **COA-GPT** (Exército dos EUA, 2024) é o mais parecido com "decisão A ou B": o modelo propõe vários cursos de ação,
  um simulador pontua-os e o comandante refina-os em linguagem natural. Chegou perto de um especialista humano em duas
  rondas.
- **Os fornecedores de software de incêndios** (Technosylva, Pano AI, Google) usam aprendizagem automática, simulação e
  deteção; não encontrámos nenhum assistente com modelo de linguagem. A Esri tem a oferta de SIG mais completa (quase
  toda em beta): assistentes que escrevem expressões e SQL, disparam ações no ArcGIS Pro e filtram camadas em
  linguagem natural.
- **A OroraTech** deixa desenhar aceiros e comparar cenários de contenção, a mesma interação do LinhaZero, sem modelo
  de linguagem.

## Padrões de interação

Em simuladores e ferramentas de "e se", a receita comum é: o modelo devolve dados estruturados ou chamadas de
ferramentas, código determinístico valida e executa, e o utilizador confirma.

| Padrão | Provas | No LinhaZero | Estado |
| --- | --- | --- | --- |
| Montar o cenário a partir de texto | Bem documentado em simulação; erra mais quando um texto curto se expande numa estrutura grande (FactoryFlow) | Mudar o vento, a duração ou a ignição | feito |
| O modelo propõe opções que o simulador pontua | COA-GPT | Propor uma decisão B; o motor escolhe o sítio (`compare_placements`) | feito |
| Explicar e comparar resultados | WildfireGPT | `explain_decision`, `stress_test`, `latest_start` | feito |
| Rever o plano do utilizador | Só indireta | `check_plan`, com verificações feitas por código | feito |
| Resumo da situação | Vários sistemas avaliados (relatórios humanitários com mais de 76% de precisão nas citações); há sempre revisão humana | Resumo para o COS | feito |
| Perguntas sobre documentação | O padrão mais comum em produção | Não previsto; seria barato sobre a própria documentação do LinhaZero | — |
| Assistente que mexe no mapa | Esri, ferramentas para MapLibre (map-mcp) | Mostrar um lugar no mapa, colocar ações | feito |

## Como dar o contexto espacial

- **Texto estruturado ganha a imagens:** a grelha como lista de vizinhos deu 2 a 5 vezes mais acerto do que desenhada.
  Coordenadas numéricas sozinhas ajudam pouco (EMNLP 2025).
- **O que funciona é a aplicação calcular os factos e dar ao modelo um texto curto, com nomes e unidades.** No
  LinhaZero: a ignição e o lugar mais próximo, o vento e a sua origem, os resultados de cada decisão, o caminho crítico
  até cada lugar com o tempo de chegada e o que mais pesa na velocidade (combustível, vento, declive), e as ações com
  tipo, minutos e lugar mais próximo.
- **Grelhas em bruto não cabem:** a grelha de 100 m de Guimarães tem 157 × 152 células; um carácter por célula dá
  cerca de 10 mil tokens por camada (estimativa), e a de 30 m tem cerca de 11 vezes mais.
- **Imagens do mapa são baratas** (cerca de 1300 tokens por uma imagem de 1000 × 1000 px), mas a Anthropic avisa que as
  coordenadas lidas de uma imagem são aproximadas. Servem para perguntas gerais, nunca para tirar células.
- **O modelo escolhe entre opções com nome,** nunca escreve coordenadas nem polígonos. Um módulo determinístico passa
  as opções a geometria.

## Arquitetura, modelo e custo

Factos das páginas da Anthropic consultadas a 22 de outubro de 2026:

- Chamar a API diretamente do browser é possível mas desaconselhado: a chave fica à vista de quem abre a página.
- Há um SDK oficial de C# (`Anthropic` no NuGet) e um de TypeScript, ambos com streaming.
- `strict: true` numa ferramenta garante que os argumentos respeitam o esquema. Os esquemas não aceitam mínimos,
  máximos nem limites de tamanho, por isso os limites (minutos dentro da duração, células dentro da grelha) validam-se
  no código.
- Os modelos atuais têm janela de 1 milhão de tokens. Preço por milhão de tokens de entrada / saída: Haiku 5.5 0,10 /
  0,50 US$ (mais caro acima de 100 mil tokens), Sonnet 5.5 2 / 10, Opus 5.5 4 / 20, Fable 5.1 10 / 50.
- A cache do prompt é por prefixo (ferramentas, sistema, mensagens): qualquer byte que mude invalida o que vem depois. A
  leitura em cache custa 5% do preço normal.
- Estimativa do estudo para uma sessão de 10 perguntas com cerca de 30 pedidos e cache: cerca de 0,03 US$ com Haiku,
  0,60 com Sonnet e 1,15 com Opus. Não medida.
- Um servidor MCP não faz falta: há um só anfitrião (a nossa API) e um só fornecedor de ferramentas (o motor).

## Como avaliar o assistente

Estado: **planeado**. Ainda não há casos de avaliação no repositório.

- Verificar por código tudo o que se pode verificar no motor; usar um modelo como juiz só para a qualidade do texto, e
  nunca o mesmo modelo que se avalia.
- Tipos de caso:
  - **explicar a comparação:** todos os números da resposta aparecem nos resultados das ferramentas; não fala de
    aldeias que não estão nos resultados; escreve em português europeu; diz que há incerteza quando a vitória anda
    perto dos 50%;
  - **propor uma decisão B:** a proposta é válida (dentro da grelha, fora de barreiras, a tempo) e ganha a A no
    ensemble pelo menos tanto como uma heurística simples, por exemplo uma linha perpendicular ao vento 1 km à frente
    da cabeça;
  - **rever um plano** com erros plantados (linha atrás da frente, contrafogo a barlavento, descarga depois de o fogo
    chegar): o assistente aponta o erro;
  - **robustez:** instruções escondidas no texto do utilizador, perguntas fora do âmbito, dados em falta.
- Partir dos incêndios reais já no repositório (as repetições de Alijó e Vieira do Minho e os 80 incêndios da
  [validação](modelo/validacao-resumo.md)) e de cenários na grelha sintética. Isto testa se as propostas fazem sentido
  no motor, não se resultariam no terreno.
- Fixar a semente do ensemble e repetir cada caso 3 vezes, para separar o ruído do modelo.

## O que seguimos e onde divergimos

| Recomendação do estudo | O que decidimos | Onde |
| --- | --- | --- |
| O modelo não escreve coordenadas; escolhe lugares pelo nome e a aplicação calcula a geometria | Seguido. Lugares e formas; mais tarde, cabeça e flancos do fogo, distâncias a um lugar e pontas apoiadas em estradas e rios | ADR [0079](decisoes/0079-assistente-com-claude-haiku.md), [0081](decisoes/0081-assistente-coloca-acoes-em-qualquer-sitio.md) |
| Todos os números vêm de ferramentas, com a origem do tempo e a incerteza à vista | Seguido | ADR [0079](decisoes/0079-assistente-com-claude-haiku.md), [0082](decisoes/0082-assistente-explica-decisoes.md) |
| Contexto em texto calculado pela aplicação, não grelhas nem imagens | Seguido: o estado da aplicação vai em texto em cada mensagem | ADR [0079](decisoes/0079-assistente-com-claude-haiku.md) |
| A chave só no servidor, com limites por pessoa e registo do gasto | Seguido: limite diário por pessoa e tabela `assistant_usage` | ADR [0079](decisoes/0079-assistente-com-claude-haiku.md) |
| A conversa e as ferramentas no servidor, com o SDK de C# | Divergimos: as ferramentas correm no browser, onde estão o estado e o motor; a API só junta o prompt e a chave e reencaminha | ADR [0079](decisoes/0079-assistente-com-claude-haiku.md) |
| Sonnet 5.5 por omissão | Divergimos: Haiku 5.5, cerca de 20 vezes mais barato, porque o trabalho difícil é do motor; muda-se com `ASSISTANT_MODEL` | ADR [0079](decisoes/0079-assistente-com-claude-haiku.md) |
| As propostas ficam como rascunho que o coordenador aceita | Divergimos: entram logo no mapa, marcadas como do assistente, com "Desfazer" | ADR [0079](decisoes/0079-assistente-com-claude-haiku.md) |
| Um otimizador (corte mínimo) faz a geometria das linhas | Em parte: o motor compara até 16 sítios fixos e escolhe o melhor; o corte mínimo continua no roteiro | ADR [0081](decisoes/0081-assistente-coloca-acoes-em-qualquer-sitio.md), [roteiro](plano/roteiro.md) |
| Conjunto de casos de avaliação, corrido nos PR que mexem no assistente | Por fazer | planeado |

## O que ficou por saber

- Nenhum estudo testa modelos de linguagem a colocar linhas de contenção contra uma frente de fogo, com um simulador a
  verificar.
- Não há números de 2026 dos modelos mais recentes nos testes de mapas e labirintos; podem ser melhores.
- Não há relatos de coordenadores a usar estes assistentes em incêndios reais, nem medições de latência em aplicações
  de emergência.
- Não sabemos como os modelos lidam com topónimos portugueses e nomes locais (estradas municipais, caminhos
  florestais).
- Não cobrimos o que a UE (JRC/EFFIS, Copernicus EMS), a ANEPC ou a AGIF dizem sobre modelos de linguagem.
- Não há tempos absolutos de resposta publicados para os modelos da Anthropic, só comparações ("mais rápido").
