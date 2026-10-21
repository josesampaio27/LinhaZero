# ADR 0062: Pedidos de acesso na landing e convites por email

- Estado: aceite
- Data: 2026-10-20
- Continua a [ADR 0061](0061-keycloak-e-sessao-no-servidor.md): o registo continua fechado, e as contas passam a nascer de pedidos aprovados; com email, passa a haver recuperação de palavra-passe

## Contexto

Com a ADR 0061 só havia contas criadas à mão na consola do Keycloak, e o "Pedir acesso" da landing não fazia nada. Quem usa o LinhaZero são entidades (bombeiros, proteção civil, câmaras, GNR): o acesso tem de ser aprovado por alguém da equipa, mas sem que essa pessoa tenha de saber ou enviar palavras-passe.

## Decisão

- **O pedido:** o formulário da landing (nome, email, entidade, tipo, mensagem) envia para `POST /api/v1/access-requests`, público, que guarda na tabela `access_requests`. Proteções: só a partir dos endereços da landing (CORS), no máximo 5 por hora de cada endereço IP, um campo-armadilha escondido que só os robôs preenchem (o pedido é aceite e descartado), limites de tamanho, e a resposta é sempre 202, sem dizer se o email já existe.
- **A aprovação:** a página "Pedidos de acesso" da aplicação (`#/pedidos`) é só para o papel `linhazero-admin` do Keycloak, que vem no id_token (claim `roles`) e é verificado pela API em cada pedido. "Aprovar e enviar convite" faz a API criar o utilizador pela API de administração do Keycloak, com um cliente próprio (`linhazero-api-admin`, *client credentials*) que só pode gerir utilizadores. "Recusar" só marca o pedido.
- **O convite:** o Keycloak envia um email com uma ligação para escolher a palavra-passe (`execute-actions-email` com `UPDATE_PASSWORD`), válida 7 dias, que termina no login da aplicação. Ninguém vê nem envia a palavra-passe. Os textos (email e páginas) estão no tema `linhazero`.
- **O email:** o Keycloak envia por SMTP. Localmente vai para o Mailpit, uma caixa falsa (http://localhost:8025); no cluster, um serviço como o Brevo. Com email ligado, "Esqueceu-se da palavra-passe?" passa a existir no login.

## Porquê

- O administrador decide, mas não lida com segredos: a palavra-passe é escolhida pela própria pessoa, numa ligação que expira.
- A conta é criada pelo Keycloak, com as mesmas regras de todas as outras (política de palavras-passe, bloqueio por tentativas), sem código de contas na API.
- O cliente de administração da API só tem `manage-users`, `view-users` e `query-users`: se o segredo vazasse, não daria acesso à configuração do realm.

## Alternativas consideradas

- **Palavra-passe temporária mostrada ao administrador:** dispensa email, mas alguém tem de a enviar à pessoa por outro canal, e fica a saber uma palavra-passe que não é sua.
- **Registo aberto no Keycloak, com aprovação depois:** qualquer pessoa ficaria com conta (e com acesso ao que não pede papel) até alguém a desligar.
- **Pedidos por email para a equipa (mailto):** sem registo, sem estado (pendente, aprovado) e sem criação automática da conta.

## Consequências

- Mudanças no realm (papéis, clientes, email) só entram num realm novo: localmente refaz-se a base do Keycloak (README, "Primeira vez", passo 3); no cluster, com contas reais, mudam-se na consola.
- O primeiro administrador do cluster cria-se à mão (infra/k8s/README.md); os outros são pessoas a quem se dá o papel `linhazero-admin`.
- ~~A equipa não recebe aviso de pedidos novos.~~ Desde a [ADR 0067](0067-email-aos-administradores-por-pedido-de-acesso.md), cada pedido novo envia um email aos administradores.
