# ADR 0066: Relatórios de problemas e sugestões dentro da aplicação

- Estado: aceite
- Data: 2026-10-21
- Segue o modelo dos [pedidos de acesso](0062-pedidos-de-acesso-e-convites-por-email.md); a tabela entra pela [ADR 0065](0065-migracoes-aplicadas-pela-api.md)

## Contexto

Quem experimenta o LinhaZero não tinha onde dizer que algo falhou ou o que gostava de ver.

## Decisão

- **Quem envia:** só quem tem sessão. No menu da conta há "Reportar problema ou sugestão": o tipo (problema, sugestão, outro), a mensagem (até 4000 caracteres) e "Podem contactar-me por email". O email vem da sessão.
- **O que vai junto, sem ser escrito:** a página e o endereço (com o cenário e a variante), a versão da interface (o commit, `APP_VERSION` na imagem `web`), o browser e o tamanho do ecrã. Não vão imagens nem o conteúdo do mapa.
- **Onde fica:** na tabela `feedback`, através de `POST /api/v1/feedback`, com no máximo 20 por hora por utilizador (`FEEDBACK_PER_HOUR`).
- **Quem lê:** a página "Relatórios" (`#/relatorios`) é só para o papel `linhazero-admin`. Mostra primeiro os abertos; cada um pode ficar "Resolvido" ou "Arquivado", e voltar a abrir.

## Porquê

- Com sessão não é preciso proteção contra robôs (CORS, campo-armadilha), e sabemos a quem responder.
- A informação técnica que segue com cada relatório poupa uma troca de emails a perguntar "em que página estava?".
- Ficar na nossa base, e não no GitHub, não expõe mensagens de utilizadores a quem tem acesso ao repositório, e não precisa de um token do GitHub no cluster.

## Alternativas consideradas

- **Aberto a todos (landing e demo):** chega a mais gente, mas traz spam e relatórios sem forma de responder. Pode vir depois, com as proteções do "Pedir acesso".
- **Issues no GitHub:** fica ao lado do código, mas expõe as mensagens e precisa de um token.
- **Email para a equipa:** não tem estado (aberto, resolvido).
- **Capturas de ecrã:** ajudam nos problemas visuais, mas exigem guardar ficheiros ([ADR 0032](0032-sem-armazenamento-de-objetos.md)).

## Consequências

- A equipa não é avisada quando chega um relatório novo, como acontece com os pedidos de acesso: tem de ir ver à página.
