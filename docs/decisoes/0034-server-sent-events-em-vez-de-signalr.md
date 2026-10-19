# ADR 0034: Server-Sent Events em vez de SignalR

- Estado: aceite
- Data: 2026-10-17

## Decisão

O progresso das corridas chega ao browser por SSE (`TypedResults.ServerSentEvents`, `EventSource`), sem dependência npm; o endpoint subscreve o NATS antes de ler a linha, para nunca perder um `done` que aconteça no momento da ligação.

## Porquê

O progresso só flui do servidor para o browser.

## Alternativas consideradas

SignalR. Volta quando as anotações partilhadas entre entidades ([o que fica de fora](../arquitetura/04-estrategia.md#o-que-fica-de-fora-e-quando-volta)) precisarem de tráfego nos dois sentidos.

## Notas

No browser, um `onerror` com o `EventSource` já em `CLOSED` faz o fallback para o browser de imediato (o plano previa sempre `onerror` seguido de um GET à corrida; o GET só se faz quando a ligação ainda pode voltar).
