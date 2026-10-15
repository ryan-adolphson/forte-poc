import { test, expect } from '@playwright/test';
import { signIn } from './sign-in';

test.describe('Test group', () => {
  // Start signed out, so the seed goes through the login form itself.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('seed', async ({ page }) => {
    await signIn(page);

    // The catalogue has loaded: at least one product card is shown.
    await expect(page.getByRole('button', { name: /^View details of / }).first()).toBeVisible();
  });
});
