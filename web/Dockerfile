# Build context: the repo root (npm ci needs the root lockfile). Builds the interface and serves it with nginx,
# which also forwards /api to the API container. The grids are mounted at run time (see infra/docker-compose.yml).
FROM node:24.13.0-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY engine/package.json engine/
COPY engine-worker/package.json engine-worker/
COPY web/package.json web/
RUN npm ci -w web -w engine --include-workspace-root
COPY engine/src engine/src
COPY engine/tsconfig.json engine/
COPY web/ web/
RUN npm run build -w web

FROM nginxinc/nginx-unprivileged:1.28.0-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 8080
