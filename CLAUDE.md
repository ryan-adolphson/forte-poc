# forte-search

A chat search product. Users ask questions in a chat UI and an AI assistant answers by searching the company's own data through tools. It is not a general-purpose chatbot: the assistant answers only from what its tools return and declines anything outside that scope.

Setup and run instructions are in [README.md](README.md).

## Proof of concept

This project is a proof of concept. Keep everything as simple as possible.

- Build the smallest thing that demonstrates the feature. Prefer the direct solution over the flexible one.
- Do not add abstractions, configuration options, new dependencies or infrastructure for needs that do not exist yet.
- Simplicity does not relax the product rules below. Visibility and "current version only" are still enforced in code.

## Product rules

These apply to every feature.

- **Sources.** The assistant searches the database and documents. Today only the `products` table (construction materials and their properties) is searchable. Document search is planned and not built yet; do not assume a documents feature exists.
- **Current version only.** Documents exist in many versions. Search, retrieval and answers use the most current version of each document by default. Do not return, quote or mix older versions into an answer unless the user explicitly asks for a past version or a comparison, and then label which version each statement comes from.
- **Enforce it in code.** Apply "latest version" in the data-access layer and in any search index, the same way `visibleToBot` is applied today. Never rely on the model's prompt alone. Any design for document storage, ingestion or indexing must make "which version is current" an explicit, queryable fact, and must stop a superseded version from being served once a newer one arrives.
- **Visibility.** Tools reach only records marked visible to the bot. A hidden record and a non-existent one must be indistinguishable to the model and the user.
- **Product page.** `GET /api/products` returns every bot-visible product (the same set the assistant sees) through `ProductsService`. A chat request may carry `productSku`, the product the user has open; the API looks it up with `getBySku` and, only if found, prefixes the user's message with a context line built from the database row. A hidden or unknown SKU is ignored silently. The web app starts a new conversation whenever the selected product changes.

## Agents

Delegate work to the agent that owns the area.

| Agent | Owns |
|---|---|
| `ai-chatbot-expert` | Chat module, Gemini calls, tools, prompts, SSE stream contract, retrieval, scope evals |
| `nestjs-expert` | API structure, auth, config, conversations, guards, tests |
| `prisma-expert` | Schema (`contract.prisma`), migrations, queries, seed |
| `angular-expert` | Web app |
| `docker-node-expert` | Dockerfiles, Compose, nginx, Node and npm tooling |

- For a change that crosses layers, agree the contract in `packages/chat-contract` first, then give each side to its agent.
- Document search will need `ai-chatbot-expert` (retrieval and tools) and `prisma-expert` (versioned storage) together.
- The installed skills (Angular, Prisma, Gemini) are the source of truth for those APIs. Prefer them over recalled knowledge.

## Planning

- Every plan must include an explicit validation step that answers "How will we verify this change?".
- Name the concrete check, not a general intent: the specific test suite or spec file to run, the command from [Commands](#commands), or the behaviour to observe (for example, confirming Angular signal reactivity updates the view).
- A plan without a validation step is incomplete. Add one before presenting it.

## Layout

- `apps/api`: NestJS 12 API. Chat module in `src/chat` (SSE endpoint `POST /api/chat/stream`, Gemini loop, tools in `src/chat/tools`), bot data access in `src/products`.
- `apps/web`: Angular 22 app with Angular Material 22 (Material 3 theme in `src/styles.scss`, generated from the Forte logo's green `#3aab2c` and slate `#5a636b`; colours come only from `--mat-sys-*` tokens). The home page is a product catalogue (`src/app/catalogue.ts`); each product card and the header open an "Ask Forte" chat side panel (`src/app/chat-panel.ts`) with a card for the selected product. The stream client is in `src/app/chat.ts` and `src/app/sse-parser.ts`. The dev server proxies `/api` to the API. Model output is rendered as plain text, never as HTML.
- `packages/chat-contract`: types shared by both apps (declarations only, import with `import type`).
- `compose.yaml`: dev Postgres on port 5434, plus `migrate` (migrations and seed), `api` and `web` (nginx). There are no profiles: `docker compose up --build` runs the whole stack on http://localhost:8088. Dockerfiles are in `apps/api` and `apps/web`, built with the repo root as context.

Not built yet: sign-in, saved conversations and document search. The chat endpoint is unauthenticated and rate limited per client IP.

## Commands

Run from the repo root unless noted.

- Dev: `npm run db:up`, `npm run api:dev`, `npm run web:dev` (http://localhost:4200)
- Database: `npm run db:deploy -w api` (apply migrations), `npm run db:seed -w api` (sample products, idempotent)
- API checks: `npm run build -w api`, `npm run lint -w api`, `npm test -w api`, `npm run test:e2e -w api`
- Web checks: `npm run build -w web`, `npm run test -w web -- --watch=false`
- Schema change: edit `apps/api/src/prisma/contract.prisma`, then `npm run db:plan -w api -- --name <slug>`, read the plan, then `npm run db:migrate -w api`
- Scope eval: `npm run eval:scope -w api` is a dry run that lists the cases. Adding `-- --yes` calls the real model and costs money, so ask before running it.

## Gotchas

- Prisma is version 8 (release candidate), not classic Prisma. There is no `schema.prisma`, `PrismaClient`, `prisma generate` or `migrate dev`. Use the `prisma-8` skill in `apps/api/.claude/skills/`.
- Run `npm install` from the repo root with `-w api` or `-w web`, never inside an app folder.
- The global `ng` CLI is older than the workspace. Use `npx ng` from `apps/web`.
- `ProductProperty` in `packages/chat-contract` must stay a `type`, not an `interface`, or it stops being assignable to the JSON column type and the API build fails in `seed.ts`.
- The chat route is rate limited in e2e tests too (10 per minute per app instance). Keep each `describe` in `apps/api/test/chat.e2e-spec.ts` to 10 requests or fewer.
- The web app's initial bundle is about 581 kB against a 600 kB warning budget in `apps/web/angular.json`. Load new dialogs and other secondary UI lazily, as `product-details.ts` is.
- The API is ESM: relative imports end in `.js`. Tests are Vitest and lint is oxlint (the NestJS 12 defaults), not Jest and ESLint.
- Gemini model names and API shapes come from the `gemini-api-dev` skill, never from memory. Conversations are stored by Google (`store: true`).
- The Gemini API key lives in `apps/api/.env`. It must never reach the browser or the logs.
- Stop the dev database with `npm run db:down`, which keeps its data. `docker compose down` stops the Docker stack and the dev database together; `docker compose down -v` deletes the data. Never run `down -v` without asking.
- The Docker stack shares the dev database. Its `migrate` job applies the migrations in the working tree and re-runs the seed on every `up`.
- `docker compose config` prints the Gemini key in clear text, because it expands `apps/api/.env`. Do not run it with visible output.
- e2e tests run against the dev database, migrated and seeded. Do not modify the seeded `products` rows in tests.
- Do not commit unless asked.
