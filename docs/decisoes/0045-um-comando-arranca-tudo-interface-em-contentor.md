# ADR 0045: Um comando arranca tudo, com a interface em contentor

- Estado: aceite
- Data: 2026-10-18

## Decisão

`docker compose up -d --build`, na raiz do repositório, arranca a interface e todos os serviços. O `compose.yaml` da raiz inclui `infra/docker-compose.yml` (que continua a definir os serviços) e fixa o nome do projeto em `linha-zero`. A interface passa a ter um serviço `web`: a imagem (`web/Dockerfile`) compila-a com o mesmo `npm run build` e serve-a com nginx em http://localhost:3000. O nginx encaminha `/api` para a API (com o buffering desligado, por causa do SSE) e serve as grelhas montadas de `web/public/grids`, as mesmas que a API e os workers leem. `npm run up`, `down`, `logs` e `infra/smoke.sh` usam o compose da raiz.

`npm run dev` fica para desenvolver a interface: corre só o Vite, em http://localhost:5173, e encaminha `/api` para a API se os serviços estiverem a correr.

## Porquê

Antes eram precisos dois comandos, Docker e Node no mesmo portátil: `npm run up` para os serviços e `npm run dev` para a interface. Agora basta o Docker. A interface servida à parte da API também é o que a [vista de implantação](../arquitetura/07-implantacao.md) prevê: se a API falhar, os mapas e o motor no browser continuam a abrir.

## Alternativas consideradas

- Um script (`npm start`) que corre `npm run up` e depois `npm run dev`: continua a precisar de Node e deixa um processo preso ao terminal.
- A API .NET a servir os ficheiros da interface: junta duas peças que escalam e falham de maneira diferente, e a imagem da API passaria a precisar de Node para compilar.
- Mudar o compose para a raiz: mexe nos caminhos de todos os serviços; o `include` deixa `infra/` como estava.
