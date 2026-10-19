# ADR 0044: Variantes de grelha também no servidor

- Estado: aceite
- Data: 2026-10-17

## Decisão

O pedido de corrida (`POST /api/v1/runs`) leva, opcionalmente, a variante de grelha de cada decisão (`variants: { A, B }`), inteira, como nos ficheiros de cenário ([formato](../referencia/formato-variante.md)). A API não a lê e passa-a ao worker tal como vem. O worker valida-a com a mesma função do browser (`parseGridVariant`), verifica que foi feita para a grelha que carregou (`checkVariantBase`, com o hash da [ADR 0043](0043-um-so-hash-de-grelha-hashgrid.md)), aplica-a e usa os seus coeficientes. Uma variante que não serve falha a corrida logo, sem novas tentativas. Exemplo: `contracts/examples/run-request-variant.json`.

## Porquê

Sem isto, "comparar grelhas" ([ADR 0025](0025-variantes-de-grelha.md)) só funcionaria no browser, com 30 corridas. Validar no worker, com o código do motor, evita repetir em C# as regras das variantes; os testes do worker garantem que o servidor dá o mesmo resultado que o browser.

## Alternativas consideradas

- Mandar a grelha já alterada: pedidos de centenas de KB e nenhuma ligação à grelha oficial.
- Validar a variante também na API, em C#: duas cópias das mesmas regras.
- Recusar o servidor quando há variantes: o júri veria a opção "no servidor" desligada no cenário de prevenção.
