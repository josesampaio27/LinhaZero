# Build context: the repo root (npm ci needs the root lockfile). Only the worker and engine workspaces are installed.
FROM node:24.13.0-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY engine/package.json engine/
COPY engine-worker/package.json engine-worker/
RUN npm ci --omit=dev -w engine-worker -w engine
COPY engine/src engine/src
COPY engine-worker/src engine-worker/src
COPY engine-worker/tsconfig.json engine-worker/
ENV NODE_ENV=production
USER node
EXPOSE 9090
CMD ["node", "--import", "tsx", "engine-worker/src/main.ts"]
