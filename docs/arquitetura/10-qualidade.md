# 10. Requisitos de qualidade

Como se mede cada objetivo de qualidade da [secção 1](01-introducao-e-objetivos.md#objetivos-de-qualidade), e o desempenho medido até agora.

## Cenários de qualidade

| Qualidade | Cenário | Resposta esperada | Hoje |
| --- | --- | --- | --- |
| Compreensível | Um comandante sem formação abre um cenário de demonstração | Diz qual decisão é melhor, e com que confiança, em menos de um minuto | As mensagens já dizem "B poupa 79 edifícios · B é melhor em 27 de 30 cenários"; falta testar com utilizadores reais |
| Sem rede | Com a rede e a API desligadas, abre-se um cenário e simula-se | Funciona de ponta a ponta, três vezes seguidas | Sim, no portátil a partir de um build local; a PWA está planeada |
| Rápida | Uma comparação com incerteza no portátil de referência | Menos de 10 s (percentil 95) | 0,33 s por decisão em 40 000 células (medido); portátil de referência por definir |
| Reprodutível | Um cenário partilhado abre-se noutro computador, com as mesmas versões | Mesmo hash de resultado | O motor é determinista (testado), mas as versões ainda não se guardam |
| Segura | Um utilizador da entidade X pede um cenário privado da entidade Y | Recusado e registado no `access_log` | Planeado |
| Resiliente | O IPMA não responde | A API serve o último snapshot e a interface mostra a idade dos dados | Hackathon |
| Dados corretos | Uma camada falha em `data-prep/` | A grelha não é publicada | Planeado; hoje é publicada com a camada a zeros |

## Desempenho

| Caso | Células | Tempo |
| --- | --- | --- |
| Uma corrida (medido com `npm run bench`) | 40 000 (200 × 200) | cerca de 12 ms |
| Ensemble de 30 + 1 corridas (medido) | 40 000 | cerca de 0,33 s |
| Grelha atual de Guimarães | cerca de 24 000 (157 × 152) | abaixo dos valores de cima |
| Uma corrida, fogo a cobrir a grelha toda (medido) | 1 M (1000 × 1000) | cerca de 0,4 s |
| Ensemble de 31 corridas, fogo a cobrir a grelha toda (medido) | 1 M | cerca de 12,5 s |
| Ensemble de 31 corridas, 4 h de fogo (medido) | 1 M | cerca de 1,1 s |
| Guimarães a 30 m, 31 corridas, 4 h, vento de 10 m/s, Rothermel com 16 vizinhos (medido, `npm run bench`) | cerca de 260 000 | cerca de 0,12 s num só fio; repartir pelos núcleos ainda não é preciso |
| Duas decisões com incerteza, 30 × 30 km a 100 m (estimativa) | cerca de 90 000 | 1 a 2 s |
| Duas decisões com incerteza, 30 × 30 km a 30 m, fogo a cobrir a janela toda | cerca de 1 M | cerca de 25 s num só Web Worker (o dobro do valor medido acima). Repartir pelos núcleos do portátil (estimativa: 4 a 6 s) ainda não está feito |

As medições a 1 M de células foram feitas em memória com o motor atual. **O custo segue a área que arde, não o tamanho da grelha:** uma janela grande com um fogo de 4 horas custa pouco. As estimativas ainda não contam com o modelo físico completo, que pesa mais por passo. A resolução de 30 m é o primeiro caso que vale a pena medir com cuidado.

**Critério de aceitação:** definir com o piloto um portátil de referência (o hardware real das entidades) e exigir que uma comparação com incerteza demore menos de 10 s (percentil 95) nesse portátil. É esta medição que decide a divisão por Web Workers e, depois, o Rust/WebAssembly (ver [Estratégia](04-estrategia.md#porque-typescript-e-quando-mudar)).

## Testes

Os testes do motor, os casos de referência e o orçamento de desempenho na CI estão em [Calibração e validação](../modelo/calibracao-e-validacao.md).
