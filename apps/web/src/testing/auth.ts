import { HttpTestingController } from '@angular/common/http/testing';
import { EnvironmentProviders, inject, provideEnvironmentInitializer } from '@angular/core';
import { Auth } from '../app/auth';

/**
 * Starts a test signed in: runs the first session check and answers it. Needs
 * `provideHttpClientTesting()`.
 */
export function provideSignedIn(username = 'someone'): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    void inject(Auth).checkSession();
    inject(HttpTestingController).expectOne('/api/auth/session').flush({ username });
  });
}
