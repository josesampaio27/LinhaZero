# ADR 0080: Demonstração só de leitura

- Estado: aceite
- Data: 2026-10-22
- Sessões da [ADR 0061](0061-keycloak-e-sessao-no-servidor.md); histórico de simulações da
  [ADR 0073](0073-historico-de-simulacoes.md)

## Contexto

O "Cenário de demonstração" da landing abre a aplicação sem login (`?demo`, ou `?scenario=<nome>`). Até aqui quem lá
chegava tinha o editor completo: acender o fogo, desenhar decisões, mudar o tempo e a zona, abrir ficheiros, usar o
editor de grelha e as sugestões de linha. Nada disso ficava guardado (a API recusa pedidos sem sessão), mas a
demonstração era um editor sem conta, não uma demonstração.

## Decisão

- **Sem sessão, a aplicação é só de leitura** (`readOnly` em `web/src/App.tsx`, quando a sessão é `anonymous`). Pode-se:
  - abrir os exemplos de `web/public/scenarios/` (menu do título) e simulá-los;
  - ver o resultado: barra de tempo, vistas, camadas, terreno debaixo do cursor e "porque o fogo chega aqui";
  - ver o que cada exemplo tem (ignição, área ardida, tempo, ações de A e B), sem as alterar;
  - guardar o exemplo num ficheiro.
- **Não se pode** mudar a ignição, a área ardida, o tempo, a zona, as ações ou a grelha das decisões; nem abrir
  ficheiros, usar as sugestões, começar uma simulação nova ou ver ocorrências ativas. Os controlos não aparecem, e as
  funções que alteram o cenário não fazem nada.
- **`?demo` abre o primeiro exemplo** (o primeiro de `index.json`) e simula-o logo; `?scenario=<nome>` abre esse.
- **Só no browser:** uma corrida por decisão, sem incerteza. O ensemble corre no servidor e precisa de sessão; o
  horizonte e a incerteza ficam como o exemplo os traz, e o botão das definições não aparece.
- **Só a página da simulação:** o editor de grelha, os pedidos de acesso e os relatórios precisam de sessão
  (`web/src/main.tsx`); o menu da barra não aparece.
- Uma nota no painel diz o que a demonstração permite, com "Entrar" para criar e alterar cenários.

## Consequências

- A regra fica na interface. Chega: sem sessão a API não guarda nada, por isso nada do que se fizesse no browser
  passaria dali.
- Com sessão, ou sem resposta da API (modo sem rede), a aplicação continua completa.
- Os exemplos de hoje são incêndios reais sem ações (A e B iguais). Para mostrar uma comparação, basta acrescentar a
  `web/public/scenarios/` um exemplo com decisões diferentes.
