# 8. Conceitos transversais

Regras que atravessam várias peças: grelhas e versões, reprodutibilidade, identidade e separação entre entidades, segurança e conformidade.

## Coordenadas

Tudo o que se guarda (ignição, linhas, zonas, grelhas) está em PT-TM06 / ETRS89 (EPSG:3763), em metros. Só se converte para células na hora de simular, e para latitude/longitude na hora de desenhar no mapa. Ver [ADR 0010](../decisoes/0010-geometrias-guardadas-em-metros.md).

## Grelhas e versões

O formato atual está em [Formato da grelha](../referencia/formato-grelha.md) (feito). O que muda à escala nacional (planeado):

- **Ficheiros estáticos:** as grelhas continuam no formato atual, geradas pelos scripts de `data-prep/` e servidas como ficheiros estáticos. Não precisam de base de dados nem de servidor de tiles.
- **Área:** Portugal continental tem cerca de 89 000 km². A 30 m são cerca de 99 M células; a 100 m, cerca de 8,9 M.
- **Mosaico nacional:** tiles de 20 × 20 km em EPSG:3763, no mesmo formato, com margem de sobreposição. O browser descarrega só as tiles à volta da ignição e guarda-as em cache.
- **Domínio de cada incidente:** uma janela à volta da ignição, por exemplo 30 × 30 km (cerca de 90 000 células a 100 m, ou 1 M a 30 m). A janela alarga-se se o fogo se aproximar do limite.
- **Versões:** cada camada tem uma versão (`fuel@2026.1`, `osm@2026-10-12`, `params@ave-2026.2`). O `header.json` passa a ter a versão da grelha, o hash (sha256) de cada camada e a origem dos dados (fonte e data de cada download). Cada grelha publicada vive num caminho imutável (por exemplo `grids/guimaraes/2026.1/`) e é listada num manifesto assinado; uma versão publicada nunca se altera.
- **Publicação que falha fechada:** os scripts constroem a grelha numa pasta temporária, correm verificações (camadas não vazias, relevo plausível, edifícios e barreiras presentes) e só depois a publicam e a acrescentam ao índice. Hoje, se uma camada falha, o script escreve-a a zeros e publica a grelha na mesma; uma grelha sem relevo ou sem barreiras dá conselhos errados sem aviso.
- **Variantes:** as alterações feitas no Editor de grelha nunca mudam a grelha oficial. Guardam-se como uma variante: a grelha de base (versão e hash) mais a lista de alterações em metros, com um hash próprio. Uma variante só se aplica à grelha com o hash certo ([Formato da variante](../referencia/formato-variante.md), [ADR 0025](../decisoes/0025-variantes-de-grelha.md)).
- **Fora do git:** com mais de um distrito, as grelhas saem do repositório para o servidor de ficheiros estáticos, e os ids de lugar passam de 16 para 32 bits.
- **Pré-cálculo:** a curvatura do relevo e os campos de vento "base" por direção e classe de velocidade (8 direções × 3 velocidades) calculam-se uma vez por tile, nos scripts de preparação, e vão nas tiles como camadas extra. Em tempo real só se interpola.

## Reprodutibilidade e auditoria

**Estado:** em parte. Já existe o hash de cada grelha (`hashGrid`, calculado ao carregá-la); as variantes guardam-no e têm o seu próprio, e os cenários levam as variantes. Ainda não se guardam a versão do motor, dos parâmetros e das opções de incerteza, nem há registo das simulações.

- **Cada simulação registada guarda:** a versão e o hash da grelha, o hash da variante de cada decisão (se houver), a versão do motor (commit), a versão dos parâmetros, as opções de incerteza, o snapshot meteorológico, a semente e um hash do resultado.
- **Confirmação no servidor:** como as simulações correm no browser, o registo é o que o cliente declara. A API pode voltar a correr uma amostra das simulações (com `worker_threads`, no mesmo processo) para o confirmar.
- **Registo só de inserções:** a tabela `runs` não aceita alterações nem apagamentos, imposto pela própria base de dados (ver [Base de dados](../referencia/base-de-dados.md)).
- **Mesmo resultado na partilha:** quem abre um cenário partilhado volta a correr a simulação com as mesmas versões; se o hash do resultado não bater certo, a interface avisa (ver [Vista de execução](06-execucao.md#partilhar-um-cenário)).

## Identidade e separação entre entidades

**Estado:** em curso. O login já existe ([ADR 0061](../decisoes/0061-keycloak-e-sessao-no-servidor.md)): Keycloak em `account.<domínio>`, sessão num cookie da API, tabela `users`. Faltam as entidades, os papéis e a função de autorização.

- **Um só emissor OpenID Connect:** a API confia num só emissor.
  - Com uma entidade, é o fornecedor de identidade dela (por exemplo Microsoft Entra ID, com convidados B2B para outras entidades).
  - Com várias, um Keycloak como intermediário, que federa os fornecedores de cada entidade e o Autenticação.gov para quem não tem fornecedor próprio (algumas associações de bombeiros).
- **Papéis na aplicação:** os papéis atribuem-se na aplicação (`memberships`), não no fornecedor de identidade. Papéis por entidade: ANEPC/CDOS, bombeiros, GNR, INEM, câmara/SMPC, investigação.
- **Cada cenário pertence a uma entidade** e tem um nível de visibilidade: privado, entidade, incidente partilhado (as entidades em `incident_members`) ou formação.
- **Uma única função de autorização** decide todos os acessos, com testes próprios. Nada se abre sem passar por ela.
- **Cenários como versões imutáveis:** cada gravação cria uma versão nova, ligada à anterior; não há edições concorrentes a resolver.

## Segurança e conformidade

**Estado:** planeado.

- **Registo de auditoria:** a tabela `runs` só aceita inserções e o `access_log` regista quem abriu, partilhou ou exportou o quê. É essencial para análises pós-incidente.
- **RGPD:** a população usa-se só em agregados por subsecção estatística, sem dados pessoais. Os registos de auditoria e de utilizadores contêm, esses sim, dados pessoais dos operacionais: é preciso o registo das atividades de tratamento, prazos de conservação, um acordo de responsáveis conjuntos entre as entidades (art. 26.º) e, provavelmente, uma avaliação de impacto (AIPD). Os dados ficam na UE.
- **Cibersegurança:** autoavaliação pelo QNRCS (Quadro Nacional de Referência para a Cibersegurança, do CNCS) e cumprimento da RCM 41/2018 para sistemas da Administração Pública; obrigações de cadeia de fornecimento da NIS2 (a confirmar na transposição portuguesa); SBOM e análise de dependências na CI; um teste de intrusão antes de entrar em produção.
- **Acessibilidade:** DL 83/2018 (WCAG 2.1 AA).
- **Inteligência artificial:** se um dia os emuladores de aprendizagem automática (ver [Estado da arte](../estado-da-arte.md)) entrarem em decisões de emergência, aplica-se o regulamento europeu de IA (AI Act).
