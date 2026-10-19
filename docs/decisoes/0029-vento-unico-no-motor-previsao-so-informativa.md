# ADR 0029: Vento único no motor; previsão só informativa

- Estado: substituída pela [ADR 0050](0050-humidade-do-combustivel-e-tempo-hora-a-hora-no-motor.md)
- Data: 2026-10-17

## Decisão

O motor continua a receber um único vento; as próximas 6 horas do Open-Meteo e a humidade aparecem no cartão, com "ainda não entra no modelo" na humidade.

## Porquê

Mudar o vento ao longo da simulação é uma alteração ao motor que ainda não foi pedida; mostrar a previsão já ajuda a decidir a duração.

## Alternativas consideradas

Vento hora a hora no motor (fica para depois). Nota: os termos do Open-Meteo são não comerciais; para um piloto, dados abertos do ECMWF ou um acordo com o IPMA.
