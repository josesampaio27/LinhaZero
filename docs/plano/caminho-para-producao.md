# Do protótipo à produção

O que falta para várias entidades usarem o LinhaZero ao mesmo tempo numa intranet do Estado, quanto custa, e onde está o desenho de cada peça.

Uma revisão de arquitetura (outubro de 2026) concluiu que o desenho escala: as simulações correm nos browsers, por isso uma API e uma base de dados servem o país inteiro, também na época de incêndios. Faltam estas peças, por ordem de gravidade:

| O que falta | Solução | Esforço |
| --- | --- | --- |
| Identidade, papéis e separação entre entidades | Um só emissor OpenID Connect (Keycloak como intermediário, mais o Autenticação.gov); `organizations`, `memberships`, `incident_members`; uma função de autorização com testes; cenários como versões imutáveis ([Identidade](../arquitetura/08-conceitos.md#identidade-e-separação-entre-entidades), [Base de dados](../referencia/base-de-dados.md)) | 2 a 3 semanas, mais a adesão das entidades |
| Reprodutibilidade verificável | Versões e hashes de grelha, motor, parâmetros e opções de incerteza em cada cenário e simulação; grelhas e motor em caminhos imutáveis; `runs` só com inserções, imposto pela base de dados; reexecução de uma amostra na API ([Reprodutibilidade](../arquitetura/08-conceitos.md#reprodutibilidade-e-auditoria)) | cerca de 1 semana |
| Grelhas que falham fechadas | Construção em pasta temporária, verificações, publicação atómica, manifesto ([Grelhas e versões](../arquitetura/08-conceitos.md#grelhas-e-versões)) | 1 a 2 dias |
| Adaptação à intranet | Lista de destinos autorizados, proxy e autoridade de certificação; fundo cartográfico interno; pacotes assinados ([Intranet](../arquitetura/07-implantacao.md#intranet)) | 3 dias, mais as autorizações de rede e os acordos de dados |
| Funcionamento sem rede a sério | PWA e "importar pacote de grelhas" a partir de ficheiro ([Funcionamento sem rede](../arquitetura/07-implantacao.md#funcionamento-sem-rede)) | cerca de 1 semana |
| Disponibilidade e cópias de segurança | Duas instâncias da API, advisory lock, ficheiros estáticos no proxy reverso, réplica do PostgreSQL, PITR e testes de reposição ([Disponibilidade](../arquitetura/07-implantacao.md#disponibilidade-época-de-incêndios)) | cerca de 1 semana |
| Conformidade | RGPD (registo de tratamento, conservação, art. 26.º, AIPD), QNRCS e RCM 41/2018, NIS2, acessibilidade, SBOM e teste de intrusão ([Segurança e conformidade](../arquitetura/08-conceitos.md#segurança-e-conformidade)) | 2 a 4 semanas, mais revisões externas |
| Node.js 22 LTS | Atualizar a versão (o Node 20 deixou de ter suporte em abril de 2026) | horas |

**Total: 2 a 3 meses**, com as mesmas quatro peças. Nada disto pede de volta os microsserviços, as filas ou os workers postos de lado (ver [O que fica de fora](../arquitetura/04-estrategia.md#o-que-fica-de-fora-e-quando-volta)).

A ordem no tempo está no [roteiro](roteiro.md).
