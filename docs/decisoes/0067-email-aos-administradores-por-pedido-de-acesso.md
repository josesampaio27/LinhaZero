# ADR 0067: Um email aos administradores por cada pedido de acesso, com limite diário

- Estado: aceite
- Data: 2026-10-21
- Completa a [ADR 0062](0062-pedidos-de-acesso-e-convites-por-email.md): os pedidos deixam de esperar que alguém vá ver a página

## Contexto

Os pedidos de "Pedir acesso" só se viam abrindo `#/pedidos`. O email sai pelo Brevo, que no plano gratuito permite 300 emails por dia, e esse limite é partilhado com os convites e com a recuperação de palavra-passe do Keycloak. Como o formulário é público, um robô a enviar pedidos não pode gastar esse limite.

## Decisão

- **Um email por pedido, logo:** depois de guardar o pedido, a API envia um email em texto simples a todos os administradores, com nome, email, entidade, tipo, a mensagem (no máximo 500 caracteres) e a ligação para `#/pedidos`. O *Reply-To* é a pessoa que pediu. Se o email falhar, o pedido fica guardado na mesma e a resposta continua a ser 202.
- **Quem recebe:** quem tem o papel `linhazero-admin`. O cliente do Keycloak da API não pode listar utilizadores por papel (responde 403: era preciso `view-realm`), por isso a API guarda em `users.is_admin` o papel que vem em cada login.
- **Limite diário:** no máximo `ACCESS_REQUEST_EMAILS_PER_DAY` (100) por dia UTC, contando um email por destinatário, como o Brevo conta. A reserva é feita na base antes de enviar (`access_requests.notified_at` e `notified_count`), sob um advisory lock, para que duas réplicas não passem o limite. Se o envio falhar, a reserva é devolvida. Acima do limite, os pedidos ficam guardados sem aviso, e fica um aviso no log.
- **Repetidos:** se já existe um pedido pendente com o mesmo email, o novo não é guardado nem avisado. A resposta continua a ser 202, para não revelar nada.
- O SMTP é o mesmo do Keycloak (as mesmas variáveis `SMTP_*`). Na rede do cluster, a regra `smtp-relay` deixa sair a API e o Keycloak só para a porta 587.

## Porquê

- É simples: não há tarefa agendada nem resumos, e cada pedido chega logo.
- Com o limite, o pior caso fica fixo: 100 emails por dia, o que deixa cerca de 200 para os convites e para a recuperação de palavra-passe.
- Guardar o papel no login evita alargar as permissões do cliente de administração da API.

## Alternativas consideradas

- **Um resumo de 15 em 15 minutos:** gasta menos emails com muitos pedidos, mas obriga a uma tarefa agendada e atrasa o aviso. Foi posto de parte para manter a solução simples.
- **Dar `view-realm` ao cliente da API e perguntar ao Keycloak quem é administrador:** estaria sempre certo, mas o cliente passaria a poder ler a configuração do realm, e no cluster seria preciso mudá-lo à mão na consola.
- **Um único endereço da equipa:** não precisava de saber quem é administrador, mas o pedido foi avisar todos os administradores.

## Consequências

- Um administrador novo só começa a receber avisos depois de entrar na aplicação uma vez com o papel. Um papel retirado deixa de contar no login seguinte.
- O formulário continua sem CAPTCHA. O Cloudflare Turnstile na landing, e um limite da Cloudflare na página de recuperação de palavra-passe do Keycloak (que também gasta emails), ficam para depois.
- A regra de rede antiga `keycloak-to-smtp` passou a chamar-se `smtp-relay`. O deploy cria a nova mas não apaga a antiga (o runner não pode apagar regras de rede): deixá-la não faz mal, e pode apagar-se à mão.
