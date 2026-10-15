import { expect, type Page } from '@playwright/test';

/**
 * Signs in through the login form with AUTH_USERNAME / AUTH_PASSWORD, which
 * playwright.config.ts copies from apps/api/.env. Ends on /products.
 */
export async function signIn(page: Page): Promise<void> {
  const username = process.env.AUTH_USERNAME;
  const password = process.env.AUTH_PASSWORD;
  if (!username || !password) {
    throw new Error(
      'AUTH_USERNAME and AUTH_PASSWORD are not set. Set them in apps/api/.env (see README "Sign-in") ' +
        'or in the environment before running the browser tests.',
    );
  }

  await page.goto('/');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole('heading', { name: 'Products', level: 2 })).toBeVisible();
}
