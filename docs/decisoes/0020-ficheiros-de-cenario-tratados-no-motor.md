# ADR 0020: Ficheiros de cenário tratados no motor

- Estado: aceite
- Data: 2026-10-17

## Decisão

Ler, validar e converter ficheiros de cenário (`parseSavedScenario`, `buildScenario`) vive em `engine/src/scenario.ts`, e a interface, os scripts e os testes usam essa única versão. A validação diz em português o que está errado ("a ação 2 da decisão B precisa de pelo menos 3 pontos").

## Porquê

Havia duas cópias que já discordavam (o "Proteger zona" sem fator valia 0,2 nos testes e 0,1 na interface); a futura API também vai receber cenários de outras pessoas e tem de os validar da mesma forma.

## Alternativas consideradas

Manter a conversão na interface e um espelho para o Node.
