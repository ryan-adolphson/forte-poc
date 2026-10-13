# syntax=docker/dockerfile:1
# Build context is the repository root (one lockfile for all workspaces):
#   docker build -f apps/web/Dockerfile .

FROM node:24-bookworm-slim AS build
WORKDIR /app
# Manifests only, so the install layer is reused until a dependency changes.
# Every workspace manifest is needed for `npm ci` to accept the root lockfile.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/chat-contract/package.json packages/chat-contract/
RUN --mount=type=cache,target=/root/.npm npm ci -w web
COPY packages/chat-contract packages/chat-contract
COPY apps/web apps/web
RUN npm run build -w web

# Static files behind nginx, running as a non-root user on port 8080.
FROM nginxinc/nginx-unprivileged:1.30-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 8080
