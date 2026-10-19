# 2. Restrições

O que não escolhemos, mas que molda o desenho. As medidas detalhadas estão nas páginas indicadas.

## Técnicas

| Restrição | O que obriga no desenho |
| --- | --- |
| Corre nos portáteis das entidades, que podem ser antigos ou ambientes VDI | Motor leve no browser; o MapLibre precisa de WebGL2; um portátil de referência como critério ([7](07-implantacao.md#intranet), [10](10-qualidade.md)) |
| Intranet do Estado com saída para a internet filtrada ou fechada | Só a API sai, para uma lista fechada de destinos; instalação por pacotes assinados ([7](07-implantacao.md#intranet)) |
| No terreno pode não haver rede | O motor corre no browser; a API é opcional para simular; grelhas em cache ([4](04-estrategia.md)) |
| Coordenadas portuguesas | Grelhas e geometrias em PT-TM06 / ETRS89 (EPSG:3763), em metros ([ADR 0010](../decisoes/0010-geometrias-guardadas-em-metros.md)) |
| Dados portugueses com licenças próprias (FUMOD, IPMA, fogos.pt, Open-Meteo) | Confirmar o uso permitido; num piloto, acordos de dados com as entidades ([Fontes de dados](../referencia/fontes-de-dados.md)) |

## Organizacionais

| Restrição | O que obriga no desenho |
| --- | --- |
| Equipa pequena; a primeira entrega é a semana do hackathon (19 a 23 de outubro de 2026) | Quatro peças, um serviço, uma linguagem ([ADR 0022](../decisoes/0022-arquitetura-de-quatro-pecas.md)) |
| A ferramenta apoia, não substitui, quem comanda | A incerteza está sempre à mão e as mensagens dizem quantos cenários sustentam cada conclusão |
| O modelo ainda não está calibrado (parâmetros marcados "provisório") | Uso inicial em planeamento e formação, não em comando em tempo real ([Calibração](../modelo/calibracao-e-validacao.md)) |

## Legais e normativas

| Norma | Porque se aplica |
| --- | --- |
| RGPD | Os registos de auditoria e de utilizadores têm dados pessoais dos operacionais |
| QNRCS (CNCS) e RCM 41/2018 | Sistemas usados pela Administração Pública |
| NIS2 | Possíveis obrigações de cadeia de fornecimento, a confirmar na transposição portuguesa |
| DL 83/2018 | Acessibilidade de sítios e aplicações da Administração Pública (WCAG 2.1 AA) |
| Regulamento europeu de IA (AI Act) | Só se um dia entrarem modelos de aprendizagem automática em decisões de emergência |

As medidas para cada norma estão em [Conceitos transversais](08-conceitos.md#segurança-e-conformidade).
