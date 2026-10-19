# Fontes de dados

De onde vem cada dado, com que ritmo muda, para que serve, e se já o usamos.

Os dados que mudam devagar (combustível, relevo, OSM, população) entram nas grelhas pelos scripts de `data-prep/` (ver [Formato da grelha](formato-grelha.md)). Os que mudam em tempo real (meteorologia, ocorrências) são recolhidos pela API.

| Dado | Fonte | Atualização | Uso | Estado |
| --- | --- | --- | --- | --- |
| Modelos de combustível | FUMOD (Sá et al.), GeoTIFF de 100 m | Anual (antes da época) | Combustível; parâmetros de Rothermel | Feito |
| Relevo | Copernicus DEM GLO-30 (AWS Open Data); MDT da DGT onde existir | Estático | Declive; campo de vento | Feito (Copernicus) |
| Estradas, rios, edifícios, lugares | OpenStreetMap (Overpass) | Semanal | Barreiras, ativos, rede viária para os meios | Feito |
| População | INE, BGRI / Censos 2021 | Decenal | Pessoas expostas por subsecção | Hackathon |
| Equipamentos sensíveis | OpenStreetMap (escolas, lares, centros de saúde) | Semanal | Ativos a proteger | Hackathon |
| Observações meteorológicas | IPMA open data (estações horárias) | Horária | Ajustar a previsão ao momento | Hackathon |
| Risco de incêndio | IPMA, RCM a 3 dias (`/open-data/forecast/meteorology/rcm/rcm-d{0..2}.json`) | Diária | Contexto e pré-posicionamento | Hackathon |
| Avisos | IPMA (`warnings_www.json`) | Contínua | Contexto | Planeado |
| Previsão horária em grelha | Open-Meteo (ECMWF IFS, ICON-EU, AROME), ou ECMWF open data diretamente | Horária | Vento e humidade para as próximas horas | Hackathon |
| Ocorrências ativas | fogos.pt (VOST Portugal, a partir do SADO da ANEPC), `api.fogos.pt/v2/incidents/active` | Cerca de 2 min | Pré-preencher a ignição; meios empenhados | Hackathon |
| Ocupação do solo | COS da DGT | Plurianual | Validar o FUMOD, zonas urbanas | Planeado |
| Focos ativos por satélite | NASA FIRMS (VIIRS/MODIS, chave gratuita), EFFIS | Algumas vezes por dia | Deteção, progressão, calibração | Planeado |
| Áreas ardidas históricas | ICNF (dados.gov.pt) | Anual | Calibração e validação | Planeado |

## Licenças

Confirmar as condições de uso comercial do Open-Meteo para produção (é gratuito para uso não comercial) e o uso do fogos.pt e do FUMOD. Num piloto institucional, preferir acordos de dados diretamente com o IPMA, a ANEPC e o ICNF. O fogos.pt não tem garantia de serviço: para uso operacional, o feed oficial da ANEPC, por acordo.

As ligações para cada fonte estão em [Referências](../referencias.md).
