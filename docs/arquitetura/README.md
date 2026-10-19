# Arquitetura

A arquitetura do LinhaZero, organizada pelo modelo [arc42](https://arc42.org/overview/). Cada secção tem a sua página; começa pela 1 e pela 4 para ter a ideia geral.

**Em resumo:** a interface e o motor de simulação correm no browser; uma única API traz os dados externos (IPMA, Open-Meteo, fogos.pt) e guarda cenários e registos numa base de dados PostgreSQL; scripts Python preparam as grelhas fora de linha. Quatro peças, um serviço, um repositório.

| Secção | Responde a |
| --- | --- |
| [1. Introdução e objetivos](01-introducao-e-objetivos.md) | O que faz o sistema, para quem, e que qualidades importam mais |
| [2. Restrições](02-restricoes.md) | O que nos é imposto: técnica, organização, lei |
| [3. Contexto e âmbito](03-contexto.md) | Com quem e com que sistemas falamos (diagrama C4 de contexto) |
| [4. Estratégia de solução](04-estrategia.md) | As ideias centrais, a tecnologia, e o que fica de fora |
| [5. Vista de blocos](05-blocos.md) | As peças e os módulos (diagrama C4 de contentores) |
| [6. Vista de execução](06-execucao.md) | O que acontece numa comparação, numa partilha, na recolha de dados |
| [7. Vista de implantação](07-implantacao.md) | Onde corre cada peça: demonstração, piloto, época de incêndios, intranet |
| [8. Conceitos transversais](08-conceitos.md) | Grelhas e versões, reprodutibilidade, identidade, segurança e conformidade |
| 9. Decisões | Ver [decisoes/](../decisoes/README.md), uma página por decisão |
| [10. Requisitos de qualidade](10-qualidade.md) | Como se mede cada qualidade, e o desempenho medido |
| [11. Riscos e dívida técnica](11-riscos.md) | O que pode correr mal e o que sabemos que está por fazer |
| [12. Glossário](12-glossario.md) | Siglas e termos |
