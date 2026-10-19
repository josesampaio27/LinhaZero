# ADR 0036: Contratos por exemplos partilhados

- Estado: aceite
- Data: 2026-10-17

## Decisão

`contracts/examples/*.json` são a fonte de verdade; os testes dos dois lados (xUnit e Vitest) desserializam cada exemplo nos seus tipos e falham se faltar um campo. O C# só tem records para o que valida; o resto passa como `JsonElement`.

## Porquê

Dá a mesma garantia (ambos os lados concordam em cada campo que usam) sem gerador nem biblioteca de esquemas.

## Alternativas consideradas

JSON Schema ou Protobuf com geração de código (ver [API](../referencia/api.md)).
