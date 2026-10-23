# Documentação do LinhaZero

Esta pasta explica o que é o LinhaZero, como está construído e para onde vai. Para pôr a demonstração a correr, começa pelo [README do projeto](../README.md).

## Por onde começar

| Se és… | Lê primeiro | Depois |
| --- | --- | --- |
| Júri ou parceiro | [Proposta do desafio](proposta-desafio.md) e os PDFs de [hackathon/](hackathon/README.md) | [Objetivos](arquitetura/01-introducao-e-objetivos.md) e [Do protótipo à produção](plano/caminho-para-producao.md) |
| Quem vai programar | [README do projeto](../README.md) | [Estratégia](arquitetura/04-estrategia.md), [Blocos](arquitetura/05-blocos.md), [Referência](#referência) |
| Quem prepara dados | [data-prep](../data-prep/README.md) | [Formato da grelha](referencia/formato-grelha.md), [Fontes de dados](referencia/fontes-de-dados.md) |
| Quem avalia a instalação numa entidade | [Implantação](arquitetura/07-implantacao.md) | [Conceitos transversais](arquitetura/08-conceitos.md), [Do protótipo à produção](plano/caminho-para-producao.md) |
| Quem trabalha no modelo do fogo | [Modelo de propagação](modelo/propagacao.md) | [Incerteza](modelo/incerteza.md), [Calibração e validação](modelo/calibracao-e-validacao.md), [Como calibramos](modelo/como-calibramos.md) |

## O que está onde

A documentação segue o [Diátaxis](https://diataxis.fr/), que separa quatro tipos de texto por aquilo de que o leitor precisa:

| Tipo | Para quê | Onde |
| --- | --- | --- |
| Tutorial | Aprender fazendo | [README do projeto](../README.md): "Como correr" e "Usar" |
| Guia prático | Fazer uma tarefa concreta | [data-prep/README.md](../data-prep/README.md): gerar uma grelha real |
| Referência | Consultar factos exatos | [referencia/](#referência) |
| Explicação | Perceber como funciona e porquê | [arquitetura/](arquitetura/README.md), [modelo/](#modelo-do-fogo), [estado-da-arte.md](estado-da-arte.md), [decisoes/](decisoes/README.md) |

Mais duas pastas que não são documentação técnica no sentido estrito: a [proposta do desafio](proposta-desafio.md), escrita para o júri, e o [plano](#plano).

```text
docs/
  README.md                  esta página
  proposta-desafio.md        a proposta para o júri do Hack4Guimarães
  estado-da-arte.md          simuladores existentes e o que nos distingue
  investigacao-propagacao.md a investigação de base: modelos, algoritmos e dados (em inglês)
  bibliografia.md            bibliografia e fontes
  arquitetura/               a arquitetura, em arc42 (uma página por secção)
  modelo/                    o modelo do fogo: propagação, incerteza, calibração, o motor explicado
  referencia/                formatos, API, base de dados, fontes de dados
  plano/                     semana do hackathon, caminho para produção, roteiro
  decisoes/                  uma página por decisão técnica (ADR)
  hackathon/                 os PDFs entregues ao Hack4Guimarães (ficha técnica, arquitetura, guia rápido) e as suas fontes
```

### Arquitetura

[arquitetura/](arquitetura/README.md), no modelo [arc42](https://arc42.org/overview/) adaptado: só as secções com conteúdo, uma página por secção.

### Modelo do fogo

- [Modelo de propagação](modelo/propagacao.md): como o motor calcula o tempo de chegada do fogo, e como vai evoluir.
- [Incerteza](modelo/incerteza.md): o ensemble emparelhado e o que mais se vai perturbar.
- [Calibração e validação](modelo/calibracao-e-validacao.md): testes atuais, casos de referência e calibração com incêndios reais.
- [Como calibramos](modelo/como-calibramos.md): o método (pontuação de cobertura para incêndios combatidos) e os resultados de cada grelha, com gráficos.
- [O motor explicado](modelo/o-motor-explicado.md): o motor de ponta a ponta para o júri, os mentores e a comunidade científica: a grelha de Guimarães, a física, todos os parâmetros e a validação.
- [O motor contra incêndios reais](modelo/validacao-resumo.md): resumo de uma página da validação em 80 incêndios e da probabilidade calibrada.
- **Ficha técnica:** página `/ficha-tecnica` do site (`landing/src/pages/DataSheetPage.tsx`): em que se baseia o simulador, como usa o combustível e como este se relaciona com o mapa, com os números tirados de `landing/src/data/site-data.json` e da grelha de Guimarães. Pode imprimir-se ou guardar-se em PDF.

### Referência

- [Formato da grelha](referencia/formato-grelha.md)
- [Formato do ficheiro de cenário](referencia/formato-cenario.md)
- [Formato da variante de grelha](referencia/formato-variante.md)
- [API](referencia/api.md)
- [Base de dados](referencia/base-de-dados.md)
- [Fontes de dados](referencia/fontes-de-dados.md)

### Plano

- [Semana do hackathon](plano/hackathon.md) (19 a 23 de outubro de 2026)
- [Do protótipo à produção](plano/caminho-para-producao.md): o que falta para várias entidades numa intranet do Estado
- [Roteiro](plano/roteiro.md): de 0 a 24 meses
- [Melhorias do motor](plano/melhorias-do-motor.md): etapas e marcos para a grelha de 100 m, com a calibração no fim

## Convenções

- **Português europeu**, frases curtas, um assunto por página. Cada página começa por dizer o que trata.
- **O estado está sempre à vista.** Usamos três palavras: **feito** (existe no repositório), **hackathon** (previsto para a semana de 19 a 23 de outubro de 2026) e **planeado** (depois). Tabelas que misturam coisas feitas e por fazer têm uma coluna "Estado".
- **Números com origem.** Medições dizem como foram feitas; estimativas dizem que o são.
- **Diagramas no modelo [C4](https://c4model.com/)** (contexto, contentores, implantação), em Mermaid, para viverem no repositório e mudarem com o código.
- **Decisões em [ADR](decisoes/README.md):** uma página por decisão; uma decisão aceite não se reescreve, substitui-se.
- **Documentação como código:** vive no repositório e muda no mesmo commit que o código que descreve. Os nomes de ficheiros e pastas são em português, sem acentos.
