# ADR 0049: Coberto arbóreo do Copernicus para o abrigo do vento

- Estado: aceite
- Data: 2026-10-19

## Decisão

As grelhas passam a ter uma camada opcional, `canopy`: o coberto arbóreo de cada célula, em %, do Copernicus HRL Tree Cover Density 2018.

- **Origem dos dados:** o `data-prep/canopy.py` lê os pixels de 10 m do serviço de imagens público da EEA (sem conta) e faz a média por célula.
- **Uso no motor:** a folhada e o sub-bosque (modelos F e M, `underCanopy`) recebem o fator de ajuste do vento abrigado do BehavePlus (Albini e Baughman), calculado com esse coberto e uma altura de 12 m.
- **Modelos que não são abrigados:** os modelos V e NFFL, porque os arbustos e as árvores jovens são o próprio combustível.
- **Sem camada ou sem dados:** fica o fator do modelo de combustível.

## Porquê

Em Guimarães, este fator decidia o resultado: o M-EUC, o combustível mais comum, corre a 5,5 m/min abrigado e a 26 m/min sem abrigo. O FUMOD já usa a mesma camada do Copernicus para atribuir os modelos de combustível.

Em Guimarães, os dados confirmam a separação entre modelos:

- as células F e M têm em média 47% a 59% de coberto;
- as herbáceas, 9%.

Mas 61% das células V-MAa e 96% das NFFL 4 também passam o limiar de 15%, o que mostra que abrigar todos os modelos seria errado.

## Consequências

- **Hash:** uma grelha sem a camada tem o mesmo hash que antes, porque as camadas opcionais só entram no hash quando existem. A grelha de Guimarães mudou de hash: as variantes guardadas para ela no navegador têm de ser refeitas.
- **Altura das copas:** fica suposta. A altura quase não muda o fator (0,10 a 0,12 entre 8 e 25 m com 50% de coberto).
- **Dados de 2018:** os cortes e os incêndios posteriores não estão no coberto.

## Alternativas consideradas

- **Um fator fixo para F e M:** é o que fica como valor por omissão quando não há camada.
- **Altura das copas por satélite** (Meta/WRI ou ETH, 1 a 10 m): fica para quando a altura importar, por exemplo nos fogos de copas.
