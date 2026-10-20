# Incêndios de referência a 30 m

Três dos incêndios de ajuste da grelha de 30 m mais próximos de Guimarães (Baião, Valença, Valpaços), para a CI verificar a calibração de 30 m ([ADR 0062](../../../docs/decisoes/0062-calibracao-da-grelha-de-30-m.md)). Cada pasta tem o mesmo que em [`../reference`](../reference/README.md), com uma grelha de 30 m:

- **`grid/`:** a grelha à volta do fogo;
- **`observed.f32`:** a hora de chegada observada em cada célula;
- **`case.json`:** a ignição, as observações e o tempo.

Construídos com `data-prep/build_reference.py --fire <pasta> --ptfs <PT-FireSprd_v0.08> --cell 30 --out .` (ou copiados de `data-prep/out/reference-30m/`).

Fontes e licenças: as de [`../reference`](../reference/README.md).
