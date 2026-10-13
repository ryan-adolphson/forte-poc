# syntax=docker/dockerfile:1
# Build context is the repository root (one lockfile for all workspaces):
#   docker build -f apps/api/Dockerfile .

FROM node:24-bookworm-slim AS base
WORKDIR /app
# Manifests only, so the install layers are reused until a dependency changes.
# Every workspace manifest is needed for `npm ci` to accept the root lockfile.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/chat-contract/package.json packages/chat-contract/

# Production dependencies of the api workspace only.
FROM base AS prod-deps
RUN --mount=type=cache,target=/root/.npm npm ci -w api --omit=dev

# All dependencies, then compile.
FROM base AS build
RUN --mount=type=cache,target=/root/.npm npm ci -w api
COPY packages/chat-contract packages/chat-contract
COPY apps/api apps/api
RUN npm run build -w api

# One-off job: apply migrations, load the sample products, then ingest the sample data
# sheets. All three are idempotent.
# Needs the Prisma CLI (a devDependency), prisma.config.ts, the contract and migrations/.
FROM build AS migrate
# Where dist/documents/ingest.js looks by default. Only this image holds the PDFs:
# the api serves them from the database.
COPY sample-documents /app/sample-documents
WORKDIR /app/apps/api
USER node
CMD ["sh", "-c", "/app/node_modules/.bin/prisma db migrate && node dist/prisma/seed.js && node dist/documents/ingest.js"]

# Runtime: production dependencies and compiled output only.
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app ./
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 3000
# Exec form, so SIGTERM reaches Node and the app's shutdown hooks run.
CMD ["node", "dist/main.js"]
