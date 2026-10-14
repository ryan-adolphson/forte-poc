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

- **Sources.** The assistant has two sources, both reached only through tools: the product catalogue (`products`: construction materials and their properties) and the product data sheets (`documents`: one row per revision, with the extracted PDF text and the PDF itself).
- **Current version only.** Documents exist in many versions. Search, retrieval and answers use the most current version of each document by default. Do not return, quote or mix older versions into an answer unless the user explicitly asks for a past version or a comparison, and then label which version each statement comes from.
- **Enforce it in code.** Apply "latest version" in the data-access layer and in any search index, the same way `visibleToBot` is applied today. Never rely on the model's prompt alone. Any design for document storage, ingestion or indexing must make "which version is current" an explicit, queryable fact, and must stop a superseded version from being served once a newer one arrives.
- **How documents enforce it.** `DocumentsService` (`apps/api/src/documents`) is the only access to data sheets. Every read starts from its private `current()`, which puts `is_current` and the product's `visible_to_bot` in the SQL, and it has no method that takes a revision. `ingest()` is for the ingestion script only and decides which revision is current itself (latest `issueDate`, then the higher revision); a partial unique index allows one current revision per document number. No tool or endpoint can read a superseded revision yet; when asked for one, the assistant says only the current revision is available.
- **Citations.** Every answer carries its sources in `done.sources`. They are built in code (`apps/api/src/chat/sources.ts`) from what the tools returned in that turn, never from model text. A tool that returns citable records must return `sources`. Each product appears once: if it has a current data sheet, the source is that data sheet (document number, revision, issue date, link), whether the answer was read from the sheet or from the catalogue; a catalogue source is shown only for a product with no data sheet. This is a deliberate presentation rule the user asked for. Catalogue tools get the reference in code from `DocumentsService.getCurrentReferences`, and `selectSources` turns it into the data sheet source.
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
- `apps/web`: Angular 22 app with Angular Material 22 (Material 3 theme in `src/styles.scss`, generated from the Forte logo's green `#3aab2c` and slate `#5a636b`; colours come only from `--mat-sys-*` tokens). A left navigation leads to three lazy routes in `src/app/app.routes.ts`: `/products` (default, the catalogue in `catalogue.ts`), `/documents` (the current revision of every data sheet, from `GET /api/documents`) and `/forte-ai` (the assistant as a full page for general questions). "Ask Forte" on a product opens a right-hand chat panel for that product (`ChatDrawer`). The `Chat` service holds one conversation at a time, shared by the panel and the Forte AI page, both rendered by `chat-panel.ts`. The stream client is in `src/app/chat.ts` and `src/app/sse-parser.ts`. The dev server proxies `/api` to the API. Model output is rendered as plain text, never as HTML.
- `packages/chat-contract`: types shared by both apps (declarations only, import with `import type`).
- `compose.yaml`: dev Postgres on port 5434, plus `migrate` (migrations and seed), `api` and `web` (nginx). There are no profiles: `docker compose up --build` runs the whole stack on http://localhost:8088. Dockerfiles are in `apps/api` and `apps/web`, built with the repo root as context.

- `compose.prod.yaml`, `deploy/`: HTTPS overlay (Caddy) and scripts for the single-Droplet deployment; see "Deploy to a Droplet" in the README. Never run `deploy/deploy.sh` or connect to the server without asking first.
- `apps/api/src/documents`: data sheet access (`DocumentsService`), the ingestion script, `GET /api/documents` (the current revision of every data sheet of a visible product) and `GET /api/documents/:documentNumber/file`, which serves the current PDF. Links to a PDF are built by `documentUrl()` in `document-url.ts`.
- `sample-documents`: example product data sheet PDFs, loaded into `documents` by `db:ingest-docs`. `manifest.json` lists each file's SKU, revision, issue date and whether it is the current revision; two products have three revisions (A, B, C) whose older values differ from the catalogue on purpose.

- Sign-in: one shared account (`AUTH_USERNAME`, `AUTH_PASSWORD` in `apps/api/.env`). `apps/api/src/auth` checks it, issues a signed HttpOnly `forte_session` cookie and has a global `SessionGuard`: every route is closed unless marked `@Public()`. In the web app, `Auth` (`src/app/auth.ts`) holds the session, the `signedIn` guard protects the routes, and `authInterceptor` sends the user to `/login` when the API answers 401.

Not built yet: per-user accounts, saved conversations, and reading or comparing past revisions of a document. The chat endpoint needs a session and is rate limited per client IP.

## Commands

Run from the repo root unless noted.

- Dev: `npm run db:up`, `npm run api:dev`, `npm run web:dev` (http://localhost:4200)
- Database: `npm run db:deploy -w api` (apply migrations), `npm run db:seed -w api` (sample products, idempotent), `npm run db:ingest-docs -w api` (sample data sheets from `sample-documents` or `DOCS_DIR`; safe to re-run)
- API checks: `npm run build -w api`, `npm run lint -w api`, `npm test -w api`, `npm run test:e2e -w api`
- Web checks: `npm run build -w web`, `npm run test -w web -- --watch=false`
- Schema change: edit `apps/api/src/prisma/contract.prisma`, then `npm run db:plan -w api -- --name <slug>`, read the plan, then `npm run db:migrate -w api`
- Scope eval: `npm run eval:scope -w api` is a dry run that lists the cases and the model it would use (the saved Settings choice or the server default; it needs the database). Adding `-- --yes` calls the real model and costs money, so ask before running it. `-- --provider claude` or `-- --model <id>` picks a model for that run only; every model in `apps/api/src/chat/models.ts` must pass the same cases.

## Gotchas

- Prisma is version 8 (release candidate), not classic Prisma. There is no `schema.prisma`, `PrismaClient`, `prisma generate` or `migrate dev`. Use the `prisma-8` skill in `apps/api/.claude/skills/`.
- Run `npm install` from the repo root with `-w api` or `-w web`, never inside an app folder.
- The global `ng` CLI is older than the workspace. Use `npx ng` from `apps/web`.
- Never put the sign-in username or password in code, tests, placeholders or committed files; they live only in the git-ignored `apps/api/.env`. API e2e tests need them set there and sign in with `signIn(app)` from `test/sign-in.ts`; web specs that render the routes or the shell add `provideSignedIn()` from `src/testing/auth.ts`.
- New API routes are closed by default. Add `@Public()` only on purpose.
- Without `SESSION_SECRET`, sessions end when the API restarts. Cookies are not scoped by port, so the dev stack (:4200) and the Docker stack (:8088) overwrite each other's session.
- `ProductProperty` in `packages/chat-contract` must stay a `type`, not an `interface`, or it stops being assignable to the JSON column type and the API build fails in `seed.ts`.
- The chat route is rate limited in e2e tests too (10 per minute per app instance). Keep each `describe` in `apps/api/test/chat.e2e-spec.ts` to 10 requests or fewer.
- The web app's initial bundle is about 520 kB against a 600 kB warning budget in `apps/web/angular.json`, because each page is a lazy route. Load new dialogs and other secondary UI lazily, as `product-details.ts` is.
- The API is ESM: relative imports end in `.js`. Tests are Vitest and lint is oxlint (the NestJS 12 defaults), not Jest and ESLint.
- Gemini model names and API shapes come from the `gemini-api-dev` skill, never from memory. Conversations are stored by Google (`store: true`).
- The Gemini API key lives in `apps/api/.env`. It must never reach the browser or the logs.
- The assistant's provider and model are one server-wide setting (table `assistant_settings`, `GET`/`PUT /api/settings/assistant`, the web Settings page), chosen from the allow-list in `apps/api/src/chat/models.ts` and resolved at the start of each turn; chat requests do not choose a model. Only `test/settings.e2e-spec.ts` may touch that row (it saves and restores it); other e2e tests use the in-memory setting from `test/chat-app.ts`.
- Two model providers, Gemini and Claude, share one loop in `ChatService.run`; only the adapters (`apps/api/src/chat/gemini.ts`, `claude.ts`, behind `provider.ts`) differ. Product rules, tools, the system prompt and citations stay in shared code, never in an adapter. Claude API usage comes from the `claude-api` skill, never from memory; `ANTHROPIC_API_KEY` lives in `apps/api/.env` and must never reach the browser or the logs.
- Claude conversations live in API memory (`ClaudeConversations`: 2 hours idle, 500 conversations, 60 messages), are lost on restart, and only answered turns are stored. Gemini conversations are stored by Google.
- Stop the dev database with `npm run db:down`, which keeps its data. `docker compose down` stops the Docker stack and the dev database together; `docker compose down -v` deletes the data. Never run `down -v` without asking.
- The Docker stack shares the dev database. Its `migrate` job applies the migrations in the working tree and re-runs the seed on every `up`.
- `docker compose config` prints the Gemini key in clear text, because it expands `apps/api/.env`. Do not run it with visible output.
- e2e tests run against the dev database, migrated, seeded and with the data sheets ingested. Do not modify the seeded `products` rows in tests.
- `test/documents.e2e-spec.ts` writes rows numbered `TEST-DS-<run>-…` and deletes them afterwards. While it runs, the current data sheet of `FRT-MAS-AAC100` is a fake, so do not assert on that SKU's data sheet in other e2e files. The same fakes appear in `GET /api/documents` while it runs: filter out `TEST-DS-` numbers before counting.
- Do not commit unless asked.
