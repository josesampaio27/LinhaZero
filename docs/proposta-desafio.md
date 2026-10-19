# LinhaZero

**Comparar decisões antes de comprometer meios no terreno**

Proposta para o Hack4Guimarães 2035, desafio 2: "Resposta a emergências e incêndios rurais" (Proteção e Defesa).
Desafio proposto pelo Departamento de Produção e Sistemas da Universidade do Minho; mentoria do Prof. Paulo Afonso e do Laboratório da Paisagem.

---

## Numa frase

O LinhaZero mostra, em menos de um minuto, o que acontece ao fogo nas próximas horas se tomarmos a decisão A ou a decisão B. Mostra também quantos edifícios, pessoas e aldeias cada decisão protege e se os meios chegam a tempo de a pôr em prática.

## O problema

Nos primeiros minutos de um incêndio rural, quem comanda tem de decidir depressa onde pôr os meios: uma linha de contenção, um ataque direto, a proteção de uma aldeia, o corte de uma estrada. São decisões caras e difíceis de desfazer.

Hoje essas decisões apoiam-se sobretudo na experiência de quem está no terreno. A simulação existe, mas:

- **está longe de quem decide no momento.** A nível nacional, a ANEPC tem um núcleo especializado de apoio à decisão (NAD-AIR), com analistas e plataformas próprias. Nos primeiros 30 a 60 minutos de uma ocorrência local, o comandante, o serviço municipal de proteção civil ou a GNR raramente têm uma simulação à mão.
- **foi feita para especialistas.** Os simuladores conhecidos (FARSITE e FlamMap nos EUA, Prometheus no Canadá, Phoenix na Austrália, Wildfire Analyst da Technosylva) são ferramentas poderosas, mas pedem formação técnica e respondem a "para onde vai o fogo?", não a "o que acontece se eu fizer isto em vez daquilo?".
- **cada entidade vê a sua parte.** Bombeiros, proteção civil, câmara, GNR e INEM trabalham com sistemas diferentes. Falta uma imagem comum, simples, sobre a qual todos discutam a mesma pergunta.

## A nossa resposta

Uma ferramenta web que qualquer pessoa da cadeia de decisão percebe em segundos:

1. **Marca-se o ponto de ignição** no mapa.
2. **O tempo meteorológico vem preenchido** com os dados do IPMA para aquele local e aquela hora, e pode ser ajustado.
3. **Desenham-se duas decisões**: por exemplo, "linha de contenção na estrada florestal" contra "ataque direto à cabeça do fogo".
4. **Aparecem dois mapas lado a lado**, sincronizados, com o fogo a avançar hora a hora em cada um.
5. **Por baixo, a comparação em linguagem simples** (exemplos ilustrativos):
   - *"A decisão B protege 163 edifícios e cerca de 400 pessoas em Souto do Monte."*
   - *"Com a decisão A, o fogo chega à aldeia às 2h04; com a B, não chega nas próximas 4 horas."*
   - *"Em 27 de 30 variações do vento, B é melhor do que A."*
   - *"Atenção: a equipa só chega à linha aos 42 minutos e o fogo passa lá aos 35. Esta linha precisa de outro meio."*

O que distingue a ferramenta não é desenhar um fogo bonito: é **responder à pergunta de quem decide, com a margem de incerteza à vista e em português claro**.

## Porque é diferente do que já existe

| | Simuladores existentes | LinhaZero |
| --- | --- | --- |
| Pergunta a que respondem | "Para onde vai o fogo?" | "Qual de duas decisões é melhor, e com que confiança?" |
| Utilizador | Analista especializado | Quem decide no terreno e na câmara |
| Incerteza | Por vezes, em mapas de probabilidade | A um clique, e traduzida em "B é melhor em 27 de 30 cenários" |
| Meios | Geralmente não entram | Contam o tempo que os meios levam a chegar e a construir a linha |
| Dados | Exigem preparação | Já vêm preparados para Portugal: combustíveis FUMOD, IPMA, OpenStreetMap, Censos |
| Explicação | Mapa de resultado | Mostra o caminho que o fogo faz até à aldeia e porquê (vento, declive, mato) |
| Acesso | Licença comercial ou software de secretária | Abre no browser e funciona sem rede |

*O protótipo já faz a comparação de decisões, a incerteza, os dados FUMOD, Copernicus e OpenStreetMap e o funcionamento sem rede. Os meios, o IPMA, os Censos e o caminho do fogo entram na semana do hackathon (ver abaixo).*

Pomos em cinco pontos o que nos diferencia:

1. **A decisão é o centro, não o fogo.** Comparar duas alternativas sobre o mesmo cenário é exatamente o "bom resultado" que o desafio descreve.
2. **Incerteza honesta.** Um incêndio nunca se prevê com certeza. Corremos 30 variações do vento (a humidade e outras incertezas entram a seguir) e dizemos em quantas cada decisão ganha. As duas decisões enfrentam exatamente as mesmas variações, por isso a comparação é justa. A investigação portuguesa (Benali et al., 2017) mostra que esta incerteza pesa mais do que a escolha do modelo.
3. **Logística no mesmo ecrã.** Uma linha de contenção só vale se a equipa lá chegar a tempo. É aqui que a engenharia de produção e sistemas (o departamento que propõe o desafio) acrescenta valor: tempos de deslocação, ritmo de construção da linha e afetação de meios.
4. **Feito para Portugal.** Usa o mapa nacional de modelos de combustível (FUMOD), o relevo Copernicus, a meteorologia do IPMA e as ocorrências públicas da ANEPC (via fogos.pt).
5. **Aprende com incêndios passados.** O motor pode ser afinado com as áreas ardidas oficiais (ICNF) e com o avanço dos fogos registado por satélite. Cada época torna a ferramenta mais fiável na região onde é usada.

## Para quem

| Quem | Para quê |
| --- | --- |
| **Comandante das operações de socorro** | Escolher entre duas táticas nos primeiros minutos e justificar a escolha |
| **Proteção civil municipal / Gabinete Técnico Florestal** | Preparar planos prévios: "se um fogo nascer aqui com vento de leste, onde fazemos a linha?" |
| **GNR** | Saber que estradas cortar e que aldeias avisar, e com quanto tempo |
| **INEM** | Antecipar onde posicionar meios de socorro |
| **Bombeiros** | Treinar e fazer o debriefing de ocorrências reais |
| **Câmara e Laboratório da Paisagem** | Ver onde faixas de gestão de combustível protegem mais casas (prevenção): desenhá-las no Editor de grelha e comparar o território com e sem elas |

A mesma ferramenta serve **antes** (planeamento e treino), **durante** (primeiros minutos) e **depois** (análise da ocorrência). Isto é importante: uma ferramenta usada todo o ano é uma ferramenta que as pessoas sabem usar no dia em que importa.

## O que já temos (prova de conceito)

Antes do hackathon construímos um protótipo funcional:

- simulador de propagação escrito pela equipa, que corre no próprio browser em milissegundos;
- dois mapas sincronizados, com linhas de contenção, zonas de ataque e zonas protegidas;
- painel de comparação (hectares, edifícios, hora de chegada a cada aldeia);
- **Editor de grelha** para a prevenção: ver o combustível, o relevo e o lugar de cada ponto, desenhar uma faixa de gestão de combustível ou uma barreira, e comparar o território com e sem ela;
- modo de incerteza com 30 variações do vento, as mesmas para as duas decisões: o painel diz em quantas B é melhor do que A;
- **grelha real de Guimarães** (da cidade à Penha), feita com dados FUMOD, Copernicus e OpenStreetMap: cerca de 12 000 edifícios e 88 lugares;
- funciona sem internet.

Isto prova que a ideia é viável. No hackathon vamos torná-la convincente.

## O que vamos construir na semana do hackathon (19 a 23 de outubro)

A comparação com incerteza emparelhada ("B é melhor em 27 de 30 cenários") já está feita, por isso a semana fica para os dados reais, os meios e as pessoas.

| Dia | Objetivo | O que o júri vai ver |
| --- | --- | --- |
| Seg | Meteorologia real (IPMA e previsão horária) e cenário real na Penha | "Se um fogo começasse agora na Penha..." |
| Ter | Tempo de chegada dos meios e viabilidade da linha | Aviso: "a linha não fica pronta a tempo" |
| Qua | Pessoas expostas (Censos 2021), escolas e lares | "B protege cerca de 400 pessoas e uma escola" |
| Qui | Caminho do fogo até à aldeia; cenários guardados e abertos por URL | "Por aqui o fogo chega à escola em 1h40" |
| Sex | Ensaio do pitch, demonstração sem rede, vídeo de reserva | Demonstração de 3 minutos sem falhas |

**Funcionalidade-surpresa (se houver tempo):** o botão **"Sugerir um terceiro caminho"**, em que a ferramenta procura sozinha onde uma linha de contenção protegeria mais edifícios com os meios disponíveis.

## A demonstração (3 minutos)

Os números abaixo são ilustrativos; os reais saem do cenário de Guimarães que vamos preparar.

1. *"São 15h de um dia de agosto. Há uma ignição na encosta da Penha. Vento de sudoeste, 25 km/h."* Um clique.
2. *"O comandante tem duas opções e uma equipa disponível."* Desenha-se a decisão A (atacar a cabeça) e a decisão B (linha na estrada florestal).
3. Simular: os dois mapas animam lado a lado.
4. *"Com A, o fogo chega à aldeia às 2h04. Com B, não chega. B protege 160 edifícios, e é melhor em 27 de 30 variações do vento."*
5. *"Mas atenção:"* aparece o aviso de que a equipa só chega aos 42 minutos. Muda-se o início da linha e a ferramenta mostra o que ainda se salva.
6. *"E se a câmara tivesse feito uma faixa de gestão de combustível?"* No Editor de grelha desenha-se a faixa a sul de Souto do Monte e carrega-se em "Testar". *"Com a faixa, o fogo não chega a Souto do Monte, e é assim em 30 de 30 variações do vento."* A mesma ferramenta serve o combate e a prevenção.
7. *"Tudo isto em menos de um minuto, num portátil, sem internet."*

## Impacto e futuro

- **Curto prazo:** piloto com a proteção civil municipal de Guimarães e o Laboratório da Paisagem, para planeamento prévio e formação.
- **Médio prazo:** calibração com a Universidade do Minho a partir dos incêndios dos últimos anos na região do Ave; extensão aos municípios vizinhos.
- **Longo prazo:** uma plataforma nacional, preparada de raiz para crescer, que complemente o trabalho do NAD-AIR da ANEPC e da AGIF, levando a simulação aos primeiros minutos e ao nível local.

A arquitetura técnica para chegar lá está descrita em [arquitetura/](arquitetura/README.md), e o que falta para produção em [Do protótipo à produção](plano/caminho-para-producao.md).

## O que não prometemos

- **Não substituímos o julgamento de quem comanda.** A ferramenta dá uma segunda opinião rápida, com a incerteza à vista.
- **Não é ainda uma previsão validada.** Os parâmetros do modelo estão marcados como provisórios até serem calibrados com incêndios reais, e dizemos isso na própria interface.
- **Não precisa de novos sistemas nas entidades.** Funciona num browser. A exportação para os formatos que as entidades já usam (KML, GeoJSON, Shapefile) está prevista.

## Porque somos a equipa certa para este desafio

- Já provámos que a ideia funciona, com dados reais de Guimarães.
- O desafio pede "uma ferramenta que mostre o efeito de duas decisões diferentes sobre o mesmo cenário, de forma compreensível para quem decide". É, literalmente, o que o LinhaZero faz.
- Juntamos simulação física, investigação operacional (afetação de meios e decisão sob incerteza) e uma interface pensada para quem não é especialista. É o cruzamento que o Departamento de Produção e Sistemas e o Laboratório da Paisagem podem ajudar a amadurecer.
