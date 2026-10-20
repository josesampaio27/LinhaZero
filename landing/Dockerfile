# Build context: the repo root (npm ci needs the root lockfile). Builds the landing page and serves it with nginx.
# The landing imports map helpers from web/src (the @web alias) and the engine, so both are copied in.
# The hero grid is mounted at run time (see infra/docker-compose.yml); public/grids is a symlink that does not survive COPY.
FROM node:24.13.0-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY engine/package.json engine/
COPY engine-worker/package.json engine-worker/
COPY web/package.json web/
COPY landing/package.json landing/
RUN npm ci -w landing -w web -w engine --include-workspace-root
COPY engine/src engine/src
COPY engine/tsconfig.json engine/
COPY web/src web/src
COPY landing/ landing/
# Where "Entrar" and the demo go (landing/src/components/Hero.tsx); set per environment from LZ_DOMAIN.
ARG VITE_APP_URL
ENV VITE_APP_URL=$VITE_APP_URL
RUN rm -rf landing/public/grids && npm run build -w landing

FROM nginxinc/nginx-unprivileged:1.28.0-alpine
COPY landing/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/landing/dist /usr/share/nginx/html
EXPOSE 8080
