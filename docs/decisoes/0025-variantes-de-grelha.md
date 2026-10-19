# ADR 0025: Variantes de grelha, editadas numa página própria

- Estado: aceite
- Data: 2026-10-17

## Decisão

A interface passa a ter duas páginas: **Simulação** (a de hoje) e **Editor de grelha**. No editor muda-se o combustível de uma área, acrescentam-se ou tiram-se barreiras, e ajustam-se as velocidades por combustível e os coeficientes do modelo. O resultado guarda-se como uma **variante de grelha**: a grelha oficial de base (com versão e hash) mais a lista de alterações, em metros. A página de simulação pode correr sobre uma grelha oficial ou sobre uma variante e, no modo "comparar grelhas", correr a decisão A sobre a grelha de base e a decisão B sobre a variante. As grelhas oficiais nunca se alteram no browser.

## Porquê

- Responde à pergunta da prevenção, que é a do município e do Laboratório da Paisagem: *"esta faixa de gestão de combustível protege a aldeia?"*. Com o ensemble emparelhado, a resposta vem com a confiança: *"a faixa protege 120 edifícios em 27 de 30 cenários"*.
- Deixa experimentar os valores provisórios (velocidades, coeficientes) sem tocar nos ficheiros, o que ajuda a calibração e a formação.
- Guardar só as alterações, e não uma cópia da grelha, mantém as grelhas oficiais imutáveis e versionadas, e dá à variante um hash próprio: cenários e registos continuam reprodutíveis.
- As alterações em metros sobrevivem a uma mudança de resolução, como as intervenções ([ADR 0010](0010-geometrias-guardadas-em-metros.md)); um único módulo do motor aplica-as, como acontece com os cenários ([ADR 0020](0020-ficheiros-de-cenario-tratados-no-motor.md)).

## Alternativas consideradas

- Editar a grelha no browser e guardar uma cópia completa: perde-se a ligação à grelha oficial e o hash deixa de dizer o que mudou.
- Pôr as alterações de combustível como mais um tipo de intervenção das decisões: serve para "A sem faixa, B com faixa", mas mistura prevenção (meses antes) com combate (minutos), e não permite reutilizar a mesma variante em vários cenários.
- Guardar os coeficientes do modelo à parte, num "conjunto de parâmetros" próprio: mais correto em teoria, mas são dois objetos para o utilizador gerir; ficam na variante, e a calibração regional (`params@ave-2026.2`) continua a ser a fonte dos valores oficiais.
