# Forte Search

A chat assistant that answers questions about the company's construction-material products and
their properties (strength, density, thermal conductivity, standards). It answers only from the
product catalogue and declines everything else. Replies stream to the client as they are written.

This is a proof of concept.

| Path | What |
| --- | --- |
| `apps/api` | NestJS 12 API: the product catalogue, the chat stream, Gemini tool calling |
| `apps/web` | Angular 22 app: product catalogue, documents list and the Forte AI assistant |
| `packages/chat-contract` | Request and event types shared by both apps (declarations only) |
| `compose.yaml` | PostgreSQL for development, and the whole stack with `docker compose up` |

Not built yet: per-user accounts and saved conversations.

## Prerequisites

- Node.js 24 (`.nvmrc`) with npm 11
- Docker with the Compose plugin (`docker compose`)

## First-time setup

Run everything from the repository root.

```bash
npm install                               # one install for all workspaces
cp apps/api/.env.example apps/api/.env    # then set AUTH_PASSWORD and GEMINI_API_KEY (see below)
npm run db:up                             # PostgreSQL 17 on 127.0.0.1:5434, waits until healthy
npm run db:deploy -w api                  # apply migrations (safe to re-run)
npm run db:seed -w api                    # sample products (idempotent; development only)
npm run db:ingest-docs -w api             # sample data sheets (23 PDFs, 19 current; idempotent)
```

### Sign-in

The app has one shared account. Set `AUTH_USERNAME` and `AUTH_PASSWORD` in `apps/api/.env`; the
file is git-ignored, so the password is never committed. Until both are set nobody can sign in and
every data and chat route answers 401. Sign-in is limited to 10 attempts a minute.

Set `SESSION_SECRET` to any long random string to keep people signed in across API restarts;
without it every restart signs everyone out. Set `COOKIE_SECURE=true` only behind HTTPS.

### Gemini API key

Create a key at <https://aistudio.google.com/apikey> and put it in `GEMINI_API_KEY` in
`apps/api/.env`. The file is git-ignored; never commit a key. Without a key everything else works,
and the assistant answers each message with a `not_configured` error.

Conversations are stored by Google so that follow-up questions keep their context.

### Choosing the model

The Settings page in the left nav chooses the assistant's provider and model for everyone using the
app, from a fixed list (`apps/api/src/chat/models.ts`): Gemini 3.1 Flash-Lite, 3.5 Flash-Lite and
3.8 Flash; Claude Sonnet 5.5, Haiku 5.5 and Opus 5.5. Both providers use the same tools, rules and
citations, and each answer shows the model that wrote it.

- Until something is saved, the API uses Gemini with `GEMINI_MODEL`, or Claude with `CLAUDE_MODEL`
  (default `claude-sonnet-5-5`) if only Claude has a key. A saved choice that can no longer be used
  falls back to that default.
- Set `ANTHROPIC_API_KEY` in `apps/api/.env` to make Claude selectable; without it Claude is shown
  but disabled. On the Droplet, add the key to `/opt/forte/apps/api/.env` and redeploy.
- Changing the Gemini model starts a new conversation; Claude conversations continue. Claude
  conversations are kept in the API's memory and are lost when the API restarts.

## Run in development

Two terminals:

```bash
npm run api:dev    # API with reload on http://localhost:3000/api
npm run web:dev    # web app on http://localhost:4200, proxies /api to the API
```

Open <http://localhost:4200> and sign in with `AUTH_USERNAME` / `AUTH_PASSWORD` from
`apps/api/.env`. The web app has three pages, reached from the side navigation:
Products (`/products`, the default), Documents (`/documents`, the current revision of every data
sheet with a link to its PDF) and Forte AI (`/forte-ai`, the assistant for general questions).
"Ask Forte" on a product opens a side panel about that product.

`npm run db:down` stops the database and keeps its data.

## Run everything in Docker

One command builds and runs the whole stack: PostgreSQL, a one-off `migrate` job (migrations, the
sample products, then the sample data sheets), the API, and nginx serving the web app and proxying `/api/` to the API.

```bash
docker compose up --build    # add -d --wait to run it in the background
```

Open <http://localhost:8088>. Only the web port is published, on `127.0.0.1`. To use another port:
`WEB_PORT=9090 docker compose up --build`.

```bash
docker compose logs -f api web          # follow the API and nginx
docker compose logs migrate             # migration and seed output
docker compose up --build -d --wait     # rebuild after code changes
docker compose stop migrate api web && docker compose rm -f migrate api web   # stop the stack, keep the database running
docker compose down                     # stop everything, keep the data
```

Things to know:

- The Gemini key is read from `apps/api/.env` when the API container starts. It is never copied
  into an image. Without that file the stack still starts, and the assistant answers with a
  `not_configured` error. `DATABASE_URL` and `PORT` in that file are ignored here; Compose sets them.
- `docker compose config` prints the key in clear text. Do not paste its output anywhere.
- The stack uses the same `postgres` service and data as development. Each `up` applies the
  migrations in your working tree and re-runs the seed; both are safe to repeat.
- `docker compose down -v` deletes the database volume, and with it all local data.
- The API sits behind one proxy, so Compose sets `TRUST_PROXY=1` to rate limit by the client's
  address instead of nginx's. On Docker Desktop every browser on the host still shares one address.

## Deploy to a Droplet

One small server runs the same Compose stack, with Caddy in front for HTTPS:

```
browser --HTTPS--> caddy (80/443) --> web (nginx) --> api --> postgres
```

`compose.prod.yaml` adds Caddy and the HTTPS settings on top of `compose.yaml`. The images are
built on the server from a copy of this repository; there is no registry.

Once:

1. Create a DigitalOcean Droplet (Ubuntu LTS, 1 GB RAM, 25 GB disk) with your SSH key.
2. Point a hostname at its IP address, for example a free one from <https://www.duckdns.org>.
3. Prepare the server (swap, Docker, firewall, `/opt/forte`):
   `ssh root@<host> 'bash -s' < deploy/server-setup.sh`
4. On the server, create two files by hand. They are never copied from your machine and never
   overwritten by a deploy.
   - `/opt/forte/.env` with one line: `SITE_HOST=<your hostname>`
   - `/opt/forte/apps/api/.env` with `GEMINI_API_KEY`, `AUTH_USERNAME`, `AUTH_PASSWORD` and
     `SESSION_SECRET` (generate one with `openssl rand -hex 32`). Then `chmod 600` both files.

Every deploy, from the repository root on your machine:

```bash
deploy/deploy.sh root@<host>
```

It copies the working tree (not only what is committed) to `/opt/forte`, builds the images one at
a time, starts the stack and waits until it is healthy. The first build takes several minutes on
1 GB. Caddy gets its certificate on the first start; ports 80 and 443 must be reachable.

On the server, from `/opt/forte`:

```bash
docker compose -f compose.yaml -f compose.prod.yaml ps -a
docker compose -f compose.yaml -f compose.prod.yaml logs -f caddy api
```

Things to know:

- `SITE_HOST=localhost docker compose -f compose.yaml -f compose.prod.yaml up --build -d --wait`
  runs the same thing locally on <https://localhost> with a self-signed certificate.
- The API sits behind two proxies here, so the overlay sets `TRUST_PROXY=2`, and `COOKIE_SECURE=true`.
- Each deploy re-runs the migrations, the seed and the data sheet ingest. All three are safe to repeat.
- The database lives in the `postgres-data` volume on the server and is not backed up.
  `docker compose down -v` deletes it.

## Chat endpoint

`POST /api/chat/stream` takes `{ "message": "...", "previousInteractionId": "..." }` and answers
with server-sent events: `start`, `tool`, `text`, then `done` or `error`. Send the `interactionId`
from `done` back as `previousInteractionId` to continue the conversation. The types are in
[packages/chat-contract/src/index.ts](packages/chat-contract/src/index.ts).

An optional `"productSku"` tells the assistant which product the user is looking at, so "what is
its compressive strength?" works. An unknown SKU is ignored.

`GET /api/products` returns `{ "products": [...] }`: every product the assistant can see, each with
`sku`, `name`, `category`, `description` and `properties`. The catalogue page is built from it.

Every route except `/api/health` needs a session. Sign in first and send the cookie:

```bash
curl -c jar -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"<AUTH_USERNAME>","password":"<AUTH_PASSWORD>"}'

curl -N -b jar -X POST localhost:3000/api/chat/stream \
  -H 'content-type: application/json' \
  -d '{"message":"What is the compressive strength of your C32/40 concrete?"}'
```

Without a session the answer is HTTP 401. Chat is limited to 10 messages per minute per client IP
(`CHAT_RATE_LIMIT`, `CHAT_RATE_TTL_SECONDS`); beyond that it returns HTTP 429 with `Retry-After`.
The stack runs over plain HTTP, so run it locally only.

## Tests

```bash
npm run build -w api       # type-check and compile the API
npm run lint -w api
npm test -w api            # unit tests
npm run test:e2e -w api    # end-to-end tests; need the dev database up, migrated, seeded and with the data sheets ingested
npm run build -w web       # production build of the web app, checked against its size budgets
npm run test -w web -- --watch=false    # web unit tests
```

Neither test suite calls the real model. The end-to-end tests only read the seeded products.

### Scope eval

```bash
npm run eval:scope -w api             # dry run: lists the cases, calls nothing
npm run eval:scope -w api -- --yes    # calls the real model; needs GEMINI_API_KEY and costs money
```

It checks that the assistant answers product questions from the catalogue, declines everything
else, and treats a hidden product like one that does not exist.

## Sample products

The seed in [apps/api/src/prisma/seed-data.ts](apps/api/src/prisma/seed-data.ts) holds 21
fictional products in seven categories: concrete, reinforcing steel, structural steel, timber,
masonry, insulation, and cement and mortar. Values are typical figures for illustration, not a
manufacturer's data sheets. Two products are marked hidden from the assistant.

## Sample data sheets

[sample-documents/manifest.json](sample-documents/manifest.json) lists 23 one-page PDFs: one data
sheet per assistant-visible product, and two products with revisions A to C whose older values
differ on purpose. The assistant reads only the current revision of each, and each answer lists
its sources. Each product is listed once: as its current data sheet, with the
revision, when it has one, and as a catalogue entry only when it has none. `GET /api/documents/<document number>/file` serves the current PDF, for example
<http://localhost:3000/api/documents/DS-FRT-CON-C3240/file>.

## Updating dependencies

`npm run verify` runs every check in the repo (API lint, build, unit and e2e tests, web build and
tests, browser tests) and stops at the first failure; it needs the database up. In Claude Code, ask
the `dependency-manager` agent to "audit and update the dependencies": it applies security fixes and
patch/minor updates in small batches, runs `npm run verify` after each, reverts any batch that
breaks, and proposes major upgrades for you to approve. Changes are left uncommitted for review.

## Browser tests

Playwright tests live in `tests/`, test plans in `specs/`. Install the browser once:

```bash
npx playwright install chromium
```

Then, with the database up (`npm run db:up`):

```bash
npm run e2e                                  # starts or reuses the API and web dev servers
BASE_URL=http://localhost:8088 npm run e2e   # against the Docker stack instead
npm run e2e:ui                               # Playwright UI mode
```

The tests sign in with `AUTH_USERNAME` / `AUTH_PASSWORD` from `apps/api/.env`. Reports go to
`playwright-report/` (git-ignored). Read [tests/README.md](tests/README.md) before writing a test:
it covers the canned chat stream, the shared model setting and the sign-in rate limit.

Claude Code has three Playwright agents (`playwright-test-planner`, `playwright-test-generator`,
`playwright-test-healer`) that use the `playwright-test` MCP server in `.mcp.json`. After upgrading
`@playwright/test`, rerun `npx playwright init-agents --loop=claude`.

## Adding a chat tool

The assistant can only use facts returned by its tools. To give it a new one, follow
[apps/api/src/chat/tools/README.md](apps/api/src/chat/tools/README.md).
