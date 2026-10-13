# Forte Search

A chat assistant that answers questions about the company's construction-material products and
their properties (strength, density, thermal conductivity, standards). It answers only from the
product catalogue and declines everything else. Replies stream to the client as they are written.

This is a proof of concept. Only the backend exists so far.

| Path | What |
| --- | --- |
| `apps/api` | NestJS 12 API: the product catalogue, the chat stream, Gemini tool calling |
| `packages/chat-contract` | Request and event types shared with the front end (declarations only) |
| `compose.yaml` | PostgreSQL for development |

Not built yet: the web app, sign-in, saved conversations and document search.

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
```

### Gemini API key

Create a key at <https://aistudio.google.com/apikey> and put it in `GEMINI_API_KEY` in
`apps/api/.env`. The file is git-ignored; never commit a key. Without a key everything else works,
and the assistant answers each message with a `not_configured` error.

Conversations are stored by Google so that follow-up questions keep their context.

## Run in development

```bash
npm run api:dev    # API with reload on http://localhost:3000/api
```

`npm run db:down` stops the database and keeps its data.

## Chat endpoint

`POST /api/chat/stream` takes `{ "message": "...", "previousInteractionId": "..." }` and answers
with server-sent events: `start`, `tool`, `text`, then `done` or `error`. Send the `interactionId`
from `done` back as `previousInteractionId` to continue the conversation. The types are in
[packages/chat-contract/src/index.ts](packages/chat-contract/src/index.ts).

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
npm run test:e2e -w api    # end-to-end tests; need the dev database up, migrated and seeded
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

## Adding a chat tool

The assistant can only use facts returned by its tools. To give it a new one, follow
[apps/api/src/chat/tools/README.md](apps/api/src/chat/tools/README.md).
