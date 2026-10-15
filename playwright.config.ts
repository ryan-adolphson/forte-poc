import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig, devices } from '@playwright/test';

// Copy only the sign-in credentials from apps/api/.env. That file also holds API keys, which
// must not enter the test process, so it is parsed rather than loaded with process.loadEnvFile.
// A missing file or value is not an error here: the sign-in step fails with a clear message.
const apiEnvFile = join(__dirname, 'apps/api/.env');
if (existsSync(apiEnvFile)) {
  const apiEnv = parseEnv(readFileSync(apiEnvFile, 'utf8'));
  for (const name of ['AUTH_USERNAME', 'AUTH_PASSWORD']) {
    if (!process.env[name] && apiEnv[name]) process.env[name] = apiEnv[name];
  }
}

// Set BASE_URL to test a running stack (for example the Docker one on http://localhost:8088).
// Without it, Playwright starts the dev servers, or reuses them if they are already running.
const baseURL = process.env.BASE_URL ?? 'http://localhost:4200';

export default defineConfig({
  testDir: 'tests',
  // One test at a time: sign-in is limited to 10 attempts a minute per IP, and the server has
  // shared state (the saved assistant model), so parallel tests would interfere.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    // Signs in once through the login form and saves the session for the other tests.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : [
        {
          command: 'npm run api:dev',
          url: 'http://localhost:3000/api/health',
          cwd: __dirname,
          reuseExistingServer: true,
          timeout: 180_000,
        },
        {
          command: 'npm run web:dev',
          url: 'http://localhost:4200',
          cwd: __dirname,
          reuseExistingServer: true,
          timeout: 180_000,
        },
      ],
});
