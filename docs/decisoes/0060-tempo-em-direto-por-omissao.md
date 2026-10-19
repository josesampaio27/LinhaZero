# ADR 0060: Tempo em direto por omissão, com cada valor ajustável à mão

- Estado: aceite
- Data: 2026-10-20
- Muda o botão "Usar o tempo de agora" do [plano do tempo](../plano/historico/plan-weather.md); a humidade "Do tempo" da [ADR 0050](0050-humidade-do-combustivel-e-tempo-hora-a-hora-no-motor.md) passa a seguir o ar editado

## Contexto

O tempo era opcional: depois de marcar a ignição, era preciso carregar em "Usar o tempo de agora" para trazer o vento. Só o vento se podia mudar; a temperatura, a humidade e a nebulosidade eram só informação, e a secura do combustível tinha três predefinições e "Do tempo". Quem decide quer partir do tempo real e afinar um valor ou outro (um vento mais forte do que o medido, uma humidade mais baixa à tarde).

## Decisão

- **O tempo de agora é o ponto de partida.** Ao abrir uma zona, a interface pede o tempo do centro; ao marcar a ignição (no mapa ou numa ocorrência), o do ponto de ignição. "↻ Atualizar" pede-o de novo. Só conta a resposta do último pedido.
- **Cada valor atual se muda à mão:** direção e velocidade do vento, temperatura, humidade, nuvens e secura do combustível (do tempo, uma predefinição, ou os cinco valores escritos). Um valor mudado fica marcado ("ajustado · repor") e mantém-se quando chega tempo novo; os outros seguem o tempo. "Repor tudo" volta aos valores da fonte.
- **"Do tempo" segue o ar editado:** a humidade do combustível calcula-se do ar em uso, não só do ar medido.
- **A previsão hora a hora fica ligada** quando chega o primeiro tempo em direto; o minuto 0 usa os valores atuais (editados ou não) e as horas seguintes a previsão. A previsão não se edita.
- **Um cenário aberto não é reescrito:** o tempo é o do ficheiro até alguém carregar em "Usar o tempo de agora" ou mudar a ignição.
- **Sem serviço** (só `npm run dev`), o painel diz "sem tempo em direto" e tudo continua editável; a simulação corre no browser.
- A velocidade continua limitada a 72 km/h (20 m/s), o limite da API; o formato dos cenários e dos pedidos não muda. A proveniência guarda-se enquanto o vento não for mexido, como antes.

## Consequências

- Abrir a aplicação com os serviços a correr faz um pedido à API logo ao carregar a zona.
- Os valores de origem e os ajustes ficam separados no estado da interface (`web/src/lib/conditions.ts`, `useLiveWeather.ts`), por isso repor um valor é só retirar o ajuste.
- A interface tem agora testes próprios (`web/test/`), que a CI corre com os do motor.
