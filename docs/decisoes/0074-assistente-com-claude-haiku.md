# ADR 0074: Assistente com IA (Claude Haiku 5.5), que vê a aplicação e coloca ações

- Estado: aceite (prova de conceito)
- Data: 2026-10-22
- Tabela nova pela [ADR 0065](0065-migracoes-aplicadas-pela-api.md); sessões da [ADR 0061](0061-keycloak-e-sessao-no-servidor.md)

## Contexto

Quem coordena um incêndio tem pouco tempo para ler painéis. Um assistente de conversa que conhece a aplicação pode
explicar o resultado, rever um plano, propor uma decisão B e escrever um resumo para o COS.

O estudo prévio concluiu duas coisas:
- os modelos de linguagem são fracos a raciocinar sobre mapas e grelhas (pior do que "não fazer nada" a combater fogos
  num teste com agentes);
- os sistemas que funcionam juntam o modelo a um verificador exato, e o LinhaZero já tem um: o motor e o ensemble
  emparelhado.

## Decisão

- **Modelo:** Claude Haiku 5.5 (`claude-haiku-5-5`, 0,10 / 0,50 US$ por milhão de tokens de entrada / saída), pela API
  da Anthropic com uma chave. Sem modelos locais nem modo sem rede: é uma prova de conceito.
- **O modelo traduz e explica; o motor decide:**
  - todos os números vêm do estado da aplicação ou de uma ferramenta;
  - o modelo nunca escreve coordenadas: escolhe um lugar pelo nome e uma forma, e a aplicação calcula a geometria a
    partir do caminho do fogo (`web/src/assistant/shapes.ts`).
- **Onde corre cada parte:**
  - **Browser:** a conversa corre com o SDK oficial da Anthropic (`@anthropic-ai/sdk`), e as ferramentas correm aí,
    onde está o estado (`web/src/assistant/`).
  - **API:** `POST /api/v1/assistant/v1/messages` faz de intermediário. Da conversa só lê `messages`; o modelo, o
    prompt de sistema e as ferramentas (`backend/src/LinhaZero.Api/Assistant/`), os limites e a chave
    (`ANTHROPIC_API_KEY`) são dela. A resposta da Anthropic segue para o browser byte a byte, em SSE.
- **O que o assistente vê:** cada mensagem do utilizador leva o estado da aplicação em texto (`<estado>`):
  - a ignição, o tempo e a sua origem;
  - as ações de A e B com os seus ids;
  - o resultado, e se está desatualizado;
  - os lugares onde o fogo chega primeiro.
- **O que pode fazer:** treze ferramentas.
  - Ler: o estado, os resultados, porque o fogo chega a um lugar, procurar lugares.
  - Mostrar um lugar no mapa.
  - Rever um plano, com verificações feitas por código (`check_plan`).
  - Mexer nas decisões: colocar, alterar e remover ações, copiar ou limpar uma decisão.
  - Mudar o vento, a duração ou a ignição.
  - Simular.
- **Colocar ações:**
  - As ações entram logo no mapa, marcadas como do assistente (contorno âmbar tracejado e "assistente" no cartão).
  - "Desfazer" no fim do pedido repõe as decisões A e B como estavam, se entretanto não mudaram.
  - As mudanças de vento ou de ignição não se desfazem aí; ficam marcadas como postas à mão, e "repor" no painel do
    tempo devolve os valores em direto.
- **Quem usa e quanto:**
  - Só quem tem sessão.
  - Cada pessoa tem um limite diário de gasto (`ASSISTANT_DAILY_BUDGET_USD`, 0,50 US$ por omissão, à meia-noite de
    Lisboa), calculado a partir dos tokens de cada resposta, que ficam na tabela `assistant_usage`.
  - Há também um limite de pedidos por hora contra ciclos (`ASSISTANT_REQUESTS_PER_HOUR`, 300).
  - Sem chave, o painel não aparece.
- **Custo por pedido:**
  - O prompt de sistema e as ferramentas são iguais em todos os pedidos e ficam em cache, tal como a conversa até ali.
  - O histórico é só acrescentado, nunca editado, como o Haiku 5.5 exige para reutilizar o seu raciocínio.

## Porquê

- **Ferramentas no browser:** o estado (decisões, resultados, mapas) vive no browser, e o motor também corre lá. No
  servidor, cada ferramenta teria de ir e voltar.
- **Chave e prompt na API:** a chave nunca chega ao browser. Como o servidor fixa o modelo e as ferramentas, um cliente
  não consegue usar a chave para outra coisa.
- **Haiku:**
  - custa cerca de 20 vezes menos do que o Sonnet;
  - os modelos baratos de outros fornecedores custam o mesmo;
  - o trabalho difícil (onde passa o fogo, o que ganha) é feito pelo motor.
- **Lugares e formas em vez de coordenadas:** é onde os modelos mais falham. A geometria a partir do caminho crítico é a
  heurística M10 do plano do motor.

## Alternativas consideradas

- **Conversa e ferramentas no servidor (SDK de C#):** a chave ficava igualmente segura, mas cada ferramenta precisava
  do estado do browser, com mais idas e voltas.
- **Chamar a Anthropic diretamente do browser:** expunha a chave.
- **O modelo desenhar a linha (coordenadas ou células):** os testes publicados mostram erros frequentes de geometria.
- **Propostas como rascunho a aceitar:** mais seguro, mas um clique a mais por proposta; ficou "entra logo, com
  Desfazer".
- **Sonnet ou Opus:** melhores a usar ferramentas, mas 20 a 40 vezes mais caros. A mudança é uma variável
  (`ASSISTANT_MODEL`).

## Consequências

- Sem rede, ou sem chave, o assistente não está disponível; o resto da aplicação não muda.
- O custo real por conversa passa a ser medido (`select sum(cost_usd) from assistant_usage …`); a estimativa é de
  poucos cêntimos por sessão.
- **Limitação:** o modelo pode ainda escrever conclusões erradas sobre números certos. O painel lembra que os números
  vêm do simulador e dos seus limites, e "Desfazer" está sempre à mão.
- **Limitação:** prompts com mais de 100 mil tokens custam 5 vezes mais. O painel pede uma conversa nova muito antes
  disso (cerca de 700 mil caracteres) e a API recusa corpos acima de 1 MB.
- O cluster abre a saída HTTPS da API para a internet (`api-anthropic` em `infra/k8s/network-policies.yaml`).
