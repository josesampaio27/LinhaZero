# ADR 0041: Cliente NATS oficial na API (NATS.Net)

- Estado: aceite
- Data: 2026-10-17

## Decisão

A API usa o pacote `NATS.Net` para publicar em JetStream, subscrever `runs.<id>.events` e ler o `num_waiting` do consumer.

## Porquê

O plano não listava nenhum cliente NATS em .NET, mas a API precisa de um; escrever o protocolo à mão seria mais código e mais risco do que a dependência oficial.

## Alternativas consideradas

Um cliente mínimo escrito à mão sobre TCP.
