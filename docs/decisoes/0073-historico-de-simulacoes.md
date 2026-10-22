# ADR 0073: Histórico de simulações, aberto com o resultado guardado

- Estado: aceite
- Data: 2026-10-22
- Usa as corridas guardadas pela [ADR 0070](0070-incerteza-sempre-no-servidor.md); a coluna nova entra pela [ADR 0065](0065-migracoes-aplicadas-pela-api.md)

## Contexto

Cada simulação com incerteza fica na base de dados (`runs` e `run_rasters`), mas a interface só a mostrava no momento
em que acabava. Quem saía do resultado não tinha como voltar a ele, nem como ver o que já tinha simulado.

O pedido guardado também não chegava para reabrir a simulação: tem as intervenções já em células do motor, e não as
linhas e zonas desenhadas, que são o que a pessoa edita.

## Decisão

- **De quem é:** cada corrida guarda quem a pediu (`runs.user_id`, migração `006_run_owner.sql`). O histórico mostra as
  corridas de quem tem sessão; os administradores (`linhazero-admin`) podem ver as de todos.
- **O que vai com o pedido:** a interface junta ao `POST /api/v1/runs` o campo `scenario`, o mesmo ficheiro de cenário
  que "Guardar ficheiro" escreve ([formato](../referencia/formato-cenario.md)). A API guarda-o com o pedido e o worker
  ignora-o.
- **Onde se vê:** "Histórico de simulações" no menu da barra de cima abre a lista (`GET /api/v1/runs`): data, zona ou
  título, vento, duração, cenários, ações de A e B, área ardida e edifícios atingidos.
- **Abrir:** repõe o cenário desenhado (`GET /api/v1/runs/{id}/scenario`, validado como um ficheiro) e mostra o
  resultado guardado e os quatro rasters, sem simular de novo. A explicação do resultado volta a ser calculada no
  browser, como depois de qualquer corrida no servidor. A partir daí tudo se edita e se simula como de costume.
- **Incerteza ligada por omissão:** só as corridas no servidor ficam guardadas, por isso "Considerar a incerteza" vem
  ligado. Com um worker livre, cada "Simular" corre no servidor e entra no histórico; sem workers fica desligado e
  inativo, como na [ADR 0070](0070-incerteza-sempre-no-servidor.md).
- **Animação:** depois de uma corrida no servidor, e ao abrir uma do histórico, a barra de tempo anda da ignição até ao
  fim, como numa corrida no browser. O resultado abre em "Chegada", que tem tempo; "Cenários" continua sem ele.
- **Corridas antigas:** as que não trazem `scenario` (de antes desta decisão) não aparecem.

## Porquê

- Mostrar o resultado guardado é imediato, não gasta workers e é exatamente o que se viu na altura, mesmo que o motor
  tenha mudado entretanto.
- Guardar o ficheiro de cenário inteiro, e não reconstruir as formas a partir das células, reabre a simulação como foi
  desenhada, com as variantes de grelha incluídas.
- Por pessoa: um coordenador vê o seu trabalho sem misturar as simulações de outros.

## Alternativas consideradas

- **Simular de novo ao abrir:** mais lento, cria outra corrida e o resultado pode ser diferente do que se viu.
- **Abrir as corridas antigas só com o resultado, com as ações em células sem edição:** mostraria tudo o que já está
  guardado, mas com uma interface diferente para essas corridas. Ficou de fora para manter um só caminho.
- **Guardar também as corridas do browser:** o browser teria de enviar os rasters, que na grelha de 30 m passam o
  limite de 1 MB por pedido. Ligar a incerteza por omissão guarda tudo com um só caminho.
- **Histórico partilhado por todos:** útil numa sala de operações, mas mistura o trabalho de várias pessoas; os
  administradores já o veem.

## Consequências

- As simulações feitas só no browser (incerteza desligada, ou sem workers) não ficam guardadas, por isso não aparecem
  no histórico.
- Cada "Simular" passa a esperar pelo servidor: na grelha de 100 m é quase instantâneo; na de 30 m, 200 cenários
  demoram vários segundos por decisão.
- Os pedidos guardados ficam maiores (o cenário repete as formas e as variantes já em células).
- Os pedidos por id (`GET /runs/{id}` e os rasters) continuam sem verificar o dono: o id é aleatório. Só o cenário
  desenhado é restrito a quem pediu a corrida e aos administradores.
