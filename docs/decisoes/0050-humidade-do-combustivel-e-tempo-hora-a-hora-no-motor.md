# ADR 0050: Humidade do combustível e tempo hora a hora no motor

- Estado: aceite
- Data: 2026-10-19
- Substitui a [ADR 0029](0029-vento-unico-no-motor-previsao-so-informativa.md)

## Decisão

- **Tempo que muda durante o fogo:** o motor aceita passos de tempo (`Scenario.weatherSteps`), cada um com o vento e, no modelo de Rothermel, a humidade do combustível.
  - Na interface, "Seguir a previsão hora a hora" cria um passo por hora da previsão do Open-Meteo dentro do horizonte. O primeiro passo usa o vento dos controlos.
  - A previsão passa a ter 8 horas, com temperatura e nebulosidade.
- **Humidade do combustível morto a partir do tempo:** o NFDRS de 1978 sem varetas (Cohen e Deeming 1985, PSW-GTR-82, verificado na fonte).
  - EMC de Simard (1968), a partir da temperatura e da humidade do ar.
  - Correção para a superfície do combustível pelo estado do tempo (nebulosidade); sem correção à noite.
  - 1 h = 1,03 × EMC e 10 h = 1,28 × EMC. O 100 h é o 10 h mais 2 pontos (provisório).
  - Na interface, "Do tempo" usa o ar da estação IPMA mais próxima (ou do modelo), a nebulosidade do modelo e a posição do sol.
- **Combustível vivo:** uma tabela por mês (provisória).

## Porquê

A humidade do combustível morto é, a seguir ao vento, a entrada que mais pesa na velocidade, e o modelo legado ignorava-a. O tempo já estava na API; faltava usá-lo.

O NFDRS sem varetas não precisa de histórico, o que serve uma ferramenta de "e se". Calcula a humidade numa hora a partir do ar dessa hora.

No Dijkstra, o tempo hora a hora custa pouco: as células saem por ordem de tempo, por isso cada mudança aplica-se uma vez, quando o relógio da pesquisa a passa, sem memória extra por passo.

## Consequências

- **Tempo usado em cada passo:** o tempo à partida da célula. Se o vento aumenta, uma partida mais tarde poderia, em teoria, chegar mais cedo; o motor ignora esse caso, como os passos de tempo do FARSITE.
- **Ensemble:** aplica o mesmo desvio de direção e fator de velocidade a todos os passos. Os cenários sem passos dão exatamente os mesmos resultados de antes.
- **Ficheiros e pedidos ao servidor:** os cenários guardam os passos (`weatherSteps`), por isso reabrem com o mesmo tempo. Os pedidos ao servidor levam-nos também e o worker valida-os.
- **Combustíveis à sombra:** o ar da estação descreve combustíveis ao sol. A folhada à sombra fica mais seca no modelo do que na realidade, o que é do lado da segurança.

## Alternativas consideradas

- **FFMC do sistema FWI (Van Wagner):** precisa do código do dia anterior e de chuva diária. Fica para quando houver histórico diário na base de dados.
- **Modelo de Nelson (2000):** fica para mais tarde, pela mesma razão.
