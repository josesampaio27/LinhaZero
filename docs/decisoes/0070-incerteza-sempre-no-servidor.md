# ADR 0070: A incerteza corre sempre no servidor, com 200 a 500 cenários

- Estado: aceite
- Data: 2026-10-22
- Completa a [ADR 0039](0039-um-job-de-cada-vez-por-worker.md): o `ack_wait` passa de 60 s para 180 s

## Contexto

"Considerar a incerteza" deixava escolher onde correr: "No dispositivo · 30" ou "No servidor · 200". Duas opções com
números diferentes confundem quem decide, e 30 cenários dão uma probabilidade com mais ruído. O motor e a API já
aceitavam até 500 corridas (`RunRequestParser.MaxRuns`).

## Decisão

- **Sempre no servidor:** com a incerteza ligada, o ensemble vai sempre para os workers do motor. Desaparece a escolha
  "Onde simular".
- **Número de cenários à escolha:** uma barra de 200 a 500 (de 50 em 50, 200 por omissão). Não fica guardado no
  cenário.
- **Sem workers, sem incerteza:** se nenhum worker foi visto livre nos últimos 60 s, o interruptor fica desligado e
  inativo, com uma nota. Se o servidor falhar a meio, cada decisão corre uma vez no browser, sem incerteza, e a
  mensagem diz porquê. Não há ensemble no browser.
- **Tempos limite:** medido num portátil, 500 cenários de 8 h na grelha de 30 m levam cerca de 43 s por decisão. Como
  `simulate` bloqueia o event loop, o worker não consegue dizer `working()` a meio de uma decisão. O `ack_wait` do
  consumer passa para 180 s (o worker atualiza um consumer antigo ao arrancar), e o browser espera o resultado até
  300 s.
- **Duração até 24 h na API:** `durationMin` passa de 60–480 para 60–1440, para que os incêndios reais (Vieira do Minho:
  1350 min) corram no servidor. A interface continua a oferecer de 1 a 8 h.

## Porquê

- Uma só forma de calcular a incerteza: o mesmo número de cenários dá sempre o mesmo resultado, e fica registado em
  `runs`.
- Na grelha de 100 m (a de omissão), 500 cenários levam cerca de 0,2 s por decisão, por isso a barra não custa nada ao
  utilizador. Só a grelha de 30 m pesa.

## Consequências

- Sem os serviços (`npm run dev` sozinho, ou sem workers), não há incerteza: só uma simulação por decisão. O objetivo
  "funciona sem rede" vale para a comparação simples.
- Um cenário de 24 h na grelha de 30 m com 500 cenários pode passar dos 180 s por decisão e ser entregue de novo a
  outro worker. Ainda não é preciso resolver; a solução é o motor ceder o event loop entre corridas.
