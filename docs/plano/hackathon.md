# Semana do hackathon

O que vamos construir de 19 a 23 de outubro de 2026, por prioridade, e o critério para cortar o que não estiver estável.

O objetivo é impressionar com o que é visível e manter a demonstração robusta. Já estão feitos o ensemble emparelhado e o Editor de grelha (inspecionar, variantes, comparar grelhas, cenário `?scenario=faixa`). A API e a base de dados entram agora, mas a demonstração não pode depender delas. O calendário dia a dia, e o que o júri vê em cada dia, está na [proposta do desafio](../proposta-desafio.md#o-que-vamos-construir-na-semana-do-hackathon-19-a-23-de-outubro).

| Prioridade | Entrega | Esforço |
| --- | --- | --- |
| 1 | **API mínima** (`api/`, Node.js + TypeScript): `/weather` com o IPMA (observações e RCM) e o Open-Meteo (vento e humidade horários), e `/incidents` com o fogos.pt, com cache e snapshots na base de dados. A interface passa a ter "usar o tempo de agora" | 1 dia |
| 1 | **Viabilidade logística simples**: base do meio, tempo de deslocação (estimativa pela rede viária do OSM) e ritmo de construção; segmentos falhados a vermelho | 1 dia |
| 1 | **Grelhas que falham fechadas** em `data-prep/`: pasta temporária, verificações, publicação só se tudo passar (protege o cenário real da Penha) | 0,5 dia |
| 2 | **Cenário real na Penha** guardado em `?scenario=penha`, com uma narrativa preparada | 0,5 dia |
| 2 | **Pessoas expostas** (INE BGRI 2021) e equipamentos sensíveis (escolas, lares, centros de saúde, do OSM) | 0,5 dia |
| 2 | **Caminho crítico até cada aldeia** (predecessores do Dijkstra) e decomposição "porquê" | 0,5 dia |
| 2 | **Cenários e simulações na base de dados**, com cenários abertos por URL; as tabelas já têm a entidade dona (sem login ainda) | 0,5 dia |
| 2 | **Versões em cada simulação:** versão e hash da grelha, versão do motor, dos parâmetros e das opções de incerteza, guardadas no cenário e no registo e mostradas no painel | 0,5 dia |
| feito | **Editor de grelha** (página `#/grelha`): pintar combustível numa área, acrescentar barreiras, velocidades por combustível e coeficientes, lista de alterações com anular, guardar a variante no browser e em ficheiro ([ADR 0025](../decisoes/0025-variantes-de-grelha.md)) | 1,5 a 2 dias |
| feito | **Variante na simulação:** escolher uma variante no menu de grelhas, aviso "Variante", hash da variante no cenário | 0,5 dia |
| feito | **Comparar grelhas:** decisão A sobre a grelha de base, decisão B sobre a variante, mesmo fogo e mesmo vento | 0,5 a 1 dia |
| 2 | **Prova de escala ao vivo:** caso de 1 M de células no `npm run bench` (30 × 30 km a 30 m) | 1 hora |
| 2 | **Node.js 22 LTS** na CI, no README e na API | 1 hora |
| 3 | "Sugerir um terceiro caminho": pesquisa local de linhas candidatas perpendiculares ao caminho crítico, avaliadas pelo motor | 1 dia |
| 3 | Elipse de Anderson e 16 vizinhos no motor (formas mais realistas) | 0,5 dia |
| 3 | PWA (a demonstração já corre sem rede no portátil, a partir de um build local) | 1 dia |

**Critério de corte:** na quinta à noite, a demonstração tem de correr sem rede e com a API desligada, de ponta a ponta, três vezes seguidas. O que não estiver estável sai.

**Para o júri, na prevenção:** o cenário `?scenario=faixa` já mostra o resultado; ao vivo, no Editor de grelha, uma técnica da câmara desenha uma faixa de gestão de combustível a sul de Souto do Monte, carrega em "Testar na simulação" e, em "comparar grelhas", vê se a faixa salva a aldeia e em quantos dos 30 cenários de vento. É a pergunta do Laboratório da Paisagem, respondida com a mesma estatística da comparação de decisões.

**Para o júri, sobre a produção:** um diapositivo "Do protótipo à produção" com a tabela de [Do protótipo à produção](caminho-para-producao.md). Mostra que sabemos o que falta para várias entidades usarem a ferramenta numa intranet do Estado, quanto custa, e que não obriga a mudar a arquitetura.
