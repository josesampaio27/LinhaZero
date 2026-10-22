# ADR 0078: Verificação dos valores das ações de combate

- Estado: aceite: não se muda nenhum valor por agora (a verificação fica registada; as propostas ficam para rever com peritos)
- Data: 2026-10-22
- Marco M12 da etapa D do plano [Melhorias do motor](../plano/melhorias-do-motor.md)

## Contexto

As ações de combate (linha de contenção, ataque, proteger zona, descarga aérea, contrafogo) usam valores em `engine/src/params.ts`, `engine/src/calibration.ts` e `engine/src/scenario.ts`. Vários estão marcados como provisórios. Verificou-se cada um com os dados que temos, com a bibliografia e com a pesquisa publicada.

## 1. Linhas e estradas que seguram (com os incêndios reais)

`engine/scripts/validate-holds.ts`: em cada estrada ou rio que o fogo real alcançou nos incêndios do PT-FireSprd, compara-se o que aconteceu (o fogo ardeu dos dois lados, ou não) com a probabilidade de segurar que o modelo dá (`holdProbability`, largura sobre comprimento de chama simulado, calibração em uso).

- **Tier A** (34 incêndios, 2552 células): seguraram 50%; o modelo previa em média 8%.

  | Largura / chama | Células | Seguraram |
  | --- | --- | --- |
  | 0–1 | 382 | 40% |
  | 1–2 | 973 | 43% |
  | 2–5 | 1008 | 54% |
  | 5–10 | 125 | 83% |
  | mais de 10 | 64 | 97% |

  Ajuste aos incêndios: segura a 50% com largura = **2,33 × chama** (90%: 0,37 a 3,48). Em uso: 5.
- **Tier B** (46 incêndios, mapa de combustível de depois do fogo, 2052 células sem chama simulada): 4,25 × chama (90%: 1,64 a 5,46).
- **As duas recalibrações recentes** ajustaram o mesmo valor, cada uma por si: 2,30 ([ADR 0069](0069-recalibracao-da-grelha-de-100-m.md)) e 2,87 ([ADR 0077](0077-recalibracao-com-matos-e-forma-do-fogo.md)).
- **Na regra da etapa B** ([ADR 0074](0074-protocolo-da-etapa-b.md)), com a calibração em uso: 2,5 dá S +0,003 (90%: −0,000 a +0,007) e C −0,003 (−0,006 a 0,000), e o tier B também melhora; não chega ao objetivo da regra (as estradas mexem pouco na área total), mas não piora nada. 3,5 não muda nada; uma inclinação mais suave (1) dá o mesmo que 2,5.
- **Limites:** os meios defenderam muitas estradas, por isso "segurou" mistura largura e combate (por isso há 40% de estradas que seguram com chamas maiores do que a largura); um fogo que contornou a ponta de uma estrada conta como passou; as larguras são por classe de estrada, não medidas.
- **Leitura:** a forma da regra está certa (quanto mais larga a estrada em relação à chama, mais segura). Todos os indícios põem o ponto de 50% abaixo de 5, entre cerca de 2 e 3.

## 2. Quando o ataque e as descargas deixam de funcionar (com a bibliografia)

A fonte original é Andrews e Rothermel (1982), *Charts for interpreting wildland fire behavior characteristics*, USDA Forest Service GTR INT-131, tabela 1 (1 Btu/ft/s = 3,46 kW/m):

| Chama | Intensidade | Interpretação |
| --- | --- | --- |
| < 1,2 m | < 346 kW/m | Ataque à cabeça ou aos flancos com ferramentas manuais; uma linha manual deve segurar |
| 1,2–2,4 m | 346–1730 kW/m | Intenso de mais para ferramentas manuais à cabeça; linha manual não é de confiança; máquinas, autotanques e aviões com retardante podem ser eficazes |
| 2,4–3,4 m | 1730–3460 kW/m | Problemas sérios de controlo; o combate à cabeça será provavelmente ineficaz |
| > 3,4 m | > 3460 kW/m | Combate à cabeça ineficaz |

Comparação com os valores em uso:

| Ação | Em uso | Tabela | Diferença |
| --- | --- | --- | --- |
| Ataque e Proteger zona: efeito total até | 500 kW/m | 346 kW/m (ferramentas manuais) a 1730 (máquinas, água) | dentro do intervalo |
| Ataque e Proteger zona: nenhum efeito a partir de | 4000 kW/m | 3460 kW/m | o nosso é mais generoso |
| Descarga aérea: segura sempre até | 2000 kW/m | aviões com retardante eficazes até 1730 kW/m | o nosso é mais generoso |
| Descarga aérea: nunca segura a partir de | 4000 kW/m | 3460 kW/m | o nosso é mais generoso |

- O comentário do código atribui 2000 e 4000 kW/m a Alexander (2000). As reproduções da tabela de Alexander (2000) usam os limites de cerca de 350, 1700 e 3500 kW/m, os da tabela acima; 4000 kW/m é a definição de "alta intensidade" de Alexander (1982), não um limite do combate.
- Estes limites não se podem ajustar aos incêndios do PT-FireSprd: os registos não dizem onde houve ataque nem descargas.

## 3. Quanto o ataque abranda o fogo, e quanto dura uma descarga (pesquisa)

- **Não se encontrou fonte para "o ataque faz o fogo andar 5 vezes mais devagar" (0,2), nem para 10 vezes no Proteger zona (0,1).** Os modelos de combate publicados não usam um fator de velocidade: modelam o ataque como a construção de linha pelos meios contra o crescimento do perímetro (Fried e Fried 1996), com ritmos de construção por equipa (revisão de Hirsch e Martell 1996, International Journal of Wildland Fire 6: 199–215). Duff e Tolhurst (2015, International Journal of Wildland Fire 24: 735–748) reveem estes modelos.
- **Os limites de eficácia** usados em todo o lado vêm de poucas observações mal documentadas e são muitas vezes extrapolados (revisão da CSIRO sobre quantificar o combate, citando Hirsch e Martell 1996).
- **Em Portugal**, Fernandes et al. (2016) analisaram os grandes incêndios de 2003–2013: o esforço de combate não mudou o tempo até à contenção, e o tempo meteorológico e o combustível pesaram mais do que os meios (3:1 na área final).
- **Descargas aéreas:** a eficácia raramente é medida (Plucinski e Pastor 2013, International Journal of Wildland Fire 22, doi:10.1071/WF13040); não se encontrou um estudo da duração do efeito da água e do retardante em combustíveis florestais (os 20 minutos e as 2 horas continuam sem fonte).
- **Ritmos de construção de linha** (para quando houver logística): em ataque direto no sul de Espanha, cerca de 0,33 m/min por bombeiro em matos e 1,06 em folhada de pinhal (estudo citado na pesquisa; por confirmar no original).

## Proposta (não aplicada)

Decidiu-se, a 22 de outubro de 2026, não mudar nenhum destes valores agora. Ficam como ponto de partida para a revisão com peritos.

1. **Linhas e estradas:** `holdWidthPerFlame` de 5 para 2,5, com a inclinação em 3. Muda a calibração em uso: os números publicados (`site-data.json`) têm de se regenerar.
2. **Limites de intensidade pela tabela de Andrews e Rothermel (1982):** ataque e Proteger zona com efeito total até 346 kW/m e nenhum a partir de 3460; descarga aérea segura sempre até 1730 e nunca a partir de 3460. Corrigir a citação no código.
3. **Para rever com peritos (ANEPC, corpos de bombeiros):** o fator do ataque (0,2) e do Proteger zona (0,1), a duração das descargas (água 20 min, retardante 2 h) e as larguras das linhas por omissão.
