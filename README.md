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

Not built yet: sign-in, saved conversations and document search.

## Prerequisites

- Node.js 24 (`.nvmrc`) with npm 11
- Docker with the Compose plugin (`docker compose`)

## First-time setup

Run everything from the repository root.

```bash
npm install                               # one install for all workspaces
cp apps/api/.env.example apps/api/.env    # then set GEMINI_API_KEY (see below)
npm run db:up                             # PostgreSQL 17 on 127.0.0.1:5434, waits until healthy
npm run db:deploy -w api                  # apply migrations (safe to re-run)
npm run db:seed -w api                    # sample products (idempotent; development only)
npm run db:ingest-docs -w api             # sample data sheets (23 PDFs, 19 current; idempotent)
```

### Gemini API key

Create a key at <https://aistudio.google.com/apikey> and put it in `GEMINI_API_KEY` in
`apps/api/.env`. The file is git-ignored; never commit a key. Without a key everything else works,
and the assistant answers each message with a `not_configured` error.

Conversations are stored by Google so that follow-up questions keep their context.

## Run in development

Two terminals:

```bash
npm run api:dev    # API with reload on http://localhost:3000/api
npm run web:dev    # web app on http://localhost:4200, proxies /api to the API
```

Open <http://localhost:4200>. The web app has three pages, reached from the side navigation:
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

## Chat endpoint

`POST /api/chat/stream` takes `{ "message": "...", "previousInteractionId": "..." }` and answers
with server-sent events: `start`, `tool`, `text`, then `done` or `error`. Send the `interactionId`
from `done` back as `previousInteractionId` to continue the conversation. The types are in
[packages/chat-contract/src/index.ts](packages/chat-contract/src/index.ts).

An optional `"productSku"` tells the assistant which product the user is looking at, so "what is
its compressive strength?" works. An unknown SKU is ignored.

`GET /api/products` returns `{ "products": [...] }`: every product the assistant can see, each with
`sku`, `name`, `category`, `description` and `properties`. The catalogue page is built from it.

```bash
curl -N -X POST localhost:3000/api/chat/stream \
  -H 'content-type: application/json' \
  -d '{"message":"What is the compressive strength of your C32/40 concrete?"}'
```

The endpoint has no sign-in. It is limited to 10 messages per minute per client IP
(`CHAT_RATE_LIMIT`, `CHAT_RATE_TTL_SECONDS`); beyond that it returns HTTP 429 with `Retry-After`.
Run it locally only.

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
its sources. Every source shows a data sheet revision: a data sheet source its own, a catalogue
source the current data sheet of that product. `GET /api/documents/<document number>/file` serves the current PDF, for example
<http://localhost:3000/api/documents/DS-FRT-CON-C3240/file>.

## Adding a chat tool

The assistant can only use facts returned by its tools. To give it a new one, follow
[apps/api/src/chat/tools/README.md](apps/api/src/chat/tools/README.md).
