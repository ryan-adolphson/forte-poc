# Browser tests

Playwright tests for the web app. Run them from the repository root with `npm run e2e`
(see `playwright.config.ts`). Plans written by the Playwright planner agent go in `specs/`.

Rules for anyone, person or agent, writing tests here:

- **Sign in through the seed, never with typed credentials.** The `setup` project
  (`auth.setup.ts`) signs in once per run with `AUTH_USERNAME` / `AUTH_PASSWORD` from
  `apps/api/.env` and saves the session in `playwright/.auth/` (git-ignored); every test in the
  `chromium` project starts signed in, so begin with `await page.goto('/products')` or another
  page. To test the login form itself, start signed out with
  `test.use({ storageState: { cookies: [], origins: [] } })` and call `signIn(page)` from
  `sign-in.ts`, as `seed.spec.ts` does. Never write the real username or password in a test,
  a plan or a commit.
- **Mind the sign-in rate limit: 10 attempts a minute.** Reuse the saved session; keep tests that
  sign in (or try a wrong password) to a handful.
- **Do not call the real model.** Every real chat turn costs money and quota. Unless a test is
  explicitly about the real model, answer `**/api/chat/stream` with a canned stream:

  ```ts
  await page.route('**/api/chat/stream', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'event: start\ndata: {}\n\n',
        'event: text\ndata: {"delta":"Ready-Mix Concrete C32/40 has a strength class of C32/40."}\n\n',
        'event: done\ndata: {"interactionId":"test-1","usage":null,"sources":[],"provider":"gemini","model":"test-model"}\n\n',
      ].join(''),
    }),
  );
  ```

  Install the route before the action that sends the message. Event shapes are `ChatEventMap`
  in `packages/chat-contract/src/index.ts`.
- **Do not change the assistant model on the Settings page.** It is one row shared by everyone
  using the server. A test that must change it restores the previous choice afterwards.
- **Treat seeded data as read-only.** Products and data sheets come from the seed; do not edit or
  delete them.
- Tests run one at a time (`workers: 1`) because of the rate limit and the shared server state.
