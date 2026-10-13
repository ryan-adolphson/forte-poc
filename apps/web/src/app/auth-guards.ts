import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';

/** For the app's pages: waits for the first session check, then sends a signed-out user to sign in. */
export const signedIn: CanActivateFn = async (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.checkSession();
  return auth.session()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** For the sign-in page: a user who is already signed in goes to the products instead. */
export const signedOut: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.checkSession();
  return auth.session() ? router.parseUrl('/products') : true;
};
