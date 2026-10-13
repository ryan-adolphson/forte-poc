import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { Auth } from './auth';

/**
 * A 401 from the API means the session is gone. The sign-in routes are left out: there a 401 is
 * the answer to "who is signed in?" or to a wrong password.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(Auth);
  return next(request).pipe(
    tap({
      error: (error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 401 &&
          request.url.startsWith('/api/') &&
          !request.url.startsWith('/api/auth/')
        ) {
          auth.sessionLost();
        }
      },
    }),
  );
};
