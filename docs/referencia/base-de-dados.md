# Base de dados

As tabelas do PostgreSQL. Guardam cenários, o registo das simulações, os snapshots dos dados externos e as entidades; as grelhas não ficam aqui, são ficheiros estáticos.

**Estado:** esboço. Na semana do hackathon entram `organizations`, `scenarios`, `runs`, `weather_snapshots` e `incidents`, já com a entidade dona; o resto é planeado.

## Regras gerais

- Todos os ids são UUID (não sequenciais, para não se adivinharem).
- As tabelas têm a entidade dona desde o primeiro dia, mesmo antes de haver login.
- Os mapas de resultado não se guardam: recalculam-se a partir do registo, porque o motor é determinista.
- Para desenvolvimento e para a demonstração, a mesma base de dados corre localmente num contentor.

## Tabelas

| Tabela | Conteúdo |
| --- | --- |
| `organizations` | As entidades: ANEPC/CDOS, corpo de bombeiros, GNR, INEM, câmara/SMPC, investigação |
| `users` | O utilizador, identificado pelo fornecedor de identidade |
| `memberships` | Utilizador, entidade e papel |
| `incidents` | As ocorrências: cache do fogos.pt e, depois, do feed oficial da ANEPC (id externo, posição, estado, última atualização) |
| `incident_members` | Que entidades participam em cada incidente |
| `scenarios` | Entidade dona, visibilidade (privado, entidade, incidente, formação), incidente (opcional), `parent_id`, grelha e versão, o cenário em JSON ([formato](formato-cenario.md)), quem o criou e quando |
| `grid_variants` | Variantes de grelha: entidade dona, visibilidade (como nos cenários), grelha de base com versão e hash, a variante em JSON ([formato](formato-variante.md)), o seu hash, `parent_id`, quem a criou e quando |
| `runs` | O registo de cada simulação: cenário, versão e hash da grelha, hash da variante de cada decisão (se houver), versão do motor (commit), versão dos parâmetros, opções de incerteza, snapshot meteorológico, semente, métricas resumidas (JSON), hash do resultado, `client_time` (hora no browser), `received_at` (hora no servidor), quem |
| `weather_snapshots` | Fonte, célula do modelo meteorológico (não o ponto clicado, para que a cache sirva toda a gente e se respeitem os limites do Open-Meteo), hora da recolha e os dados (JSON) |
| `access_log` | Quem abriu, partilhou ou exportou o quê, e quando; exportável para o SIEM de cada entidade |

## Regras por tabela

- **`scenarios` e `grid_variants`:** cada gravação cria uma versão nova, imutável, ligada à anterior por `parent_id`; não há edições concorrentes a resolver. Um cenário refere as variantes pelo id e pelo hash.
- **`runs`:** só se acrescentam linhas. O utilizador da base de dados com que a API trabalha não tem permissão de `UPDATE` nem de `DELETE` nesta tabela.
- **Extensões:** PostGIS só quando houver pesquisas espaciais (por exemplo, ocorrências perto de um ponto).
