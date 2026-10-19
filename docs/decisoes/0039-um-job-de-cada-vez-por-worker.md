# ADR 0039: Um job de cada vez por worker

- Estado: aceite
- Data: 2026-10-17

## Decisão

Cada worker do motor faz `consumer.next()` com `expires` de 10 s, um job de cada vez, ack explícito, `ack_wait` de 60 s e `max_deliver` ilimitado; chama `working()` antes de cada decisão porque `simulate` é síncrono e bloqueia o event loop; ao fim de 3 entregas a linha fica `failed`. Um SIGTERM termina a decisão em curso, devolve o job (`nak`) e sai.

## Porquê

Um worker ocupado nunca segura jobs que outro podia tirar; `docker compose up --scale engine-worker=4` dá 4× o débito sem alterar código; o `max_deliver` sozinho deixaria em `running` para sempre uma corrida cujo worker morreu.

## Alternativas consideradas

`consume()` com buffer (até 100 mensagens por worker), `worker_threads` ou um `onRun` em `simulate` para progresso por corrida.
