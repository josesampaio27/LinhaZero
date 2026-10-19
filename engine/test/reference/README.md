# Incêndios de referência

Casos de validação do motor (ver [Calibração e validação](../../../docs/modelo/calibracao-e-validacao.md)). Cada pasta tem:

- **`grid/`:** uma grelha de 100 m à volta do fogo;
- **`observed.f32`:** a hora de chegada observada em cada célula, em minutos depois da ignição. `Infinity` = não ardeu; `NaN` = ardeu a uma hora desconhecida;
- **`case.json`:** a zona e a hora de ignição, as horas observadas e o tempo hora a hora.

Construídos com `data-prep/build_reference.py --fire <pasta> --ptfs <PT-FireSprd_v0.08> --out .`

Fontes e licenças:

- **Progressões:** PT-FireSprd v0.08, Benali, A. et al., [doi:10.5281/zenodo.7495506](https://doi.org/10.5281/zenodo.7495506), CC BY 4.0.
- **Tempo:** arquivo histórico do [Open-Meteo](https://open-meteo.com/) (ERA5, Copernicus Climate Change Service), CC BY 4.0.
- **Grelhas:** as fontes das grelhas da interface. Combustível FUMOD (Sá et al.); Copernicus DEM GLO-30 e Tree Cover Density; OpenStreetMap (ODbL).
