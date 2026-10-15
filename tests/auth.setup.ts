import { test as setup } from '@playwright/test';
import { signIn } from './sign-in';

// Signs in once per run and saves the session, so tests start signed in without using up
// the sign-in rate limit (10 a minute). The file is git-ignored.
setup('sign in', async ({ page }) => {
  await signIn(page);
  await page.context().storageState({ path: 'playwright/.auth/user.json' });
});
