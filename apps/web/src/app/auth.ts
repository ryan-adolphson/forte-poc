import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { AuthErrorBody, LoginRequest, SessionResponse } from '@forte/chat-contract';
import { firstValueFrom } from 'rxjs';

/**
 * Who is signed in. The session itself is an HttpOnly cookie that the browser sends with every
 * request to the API; this service only knows what the API says about it.
 */
@Service()
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly sessionState = signal<SessionResponse | null | undefined>(undefined);
  private firstCheck?: Promise<void>;

  /** `undefined` until the API has been asked, then who is signed in, or `null` for nobody. */
  readonly session = this.sessionState.asReadonly();

  /** Asks the API once who is signed in. Later calls wait for, or return, that first answer. */
  checkSession(): Promise<void> {
    this.firstCheck ??= firstValueFrom(this.http.get<SessionResponse>('/api/auth/session')).then(
      (session) => this.sessionState.set(session),
      () => this.sessionState.set(null), // 401 is the normal "signed out" answer
    );
    return this.firstCheck;
  }

  /** Signs in. Resolves to null, or to the message to show when it did not work. */
  async login(username: string, password: string): Promise<string | null> {
    const body: LoginRequest = { username, password };
    try {
      this.sessionState.set(
        await firstValueFrom(this.http.post<SessionResponse>('/api/auth/login', body)),
      );
      return null;
    } catch (error) {
      return describeLoginError(error);
    }
  }

  /** Signs out. The app is signed out even when the API could not be reached. */
  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', null)).catch(() => undefined);
    this.sessionState.set(null);
  }

  /**
   * The API answered 401 while the app thought it was signed in: the session expired or the API
   * restarted. Goes to the sign-in page, which returns to the current page afterwards.
   */
  sessionLost(): void {
    if (!this.sessionState()) {
      return; // already handled: several requests can fail at once
    }
    this.sessionState.set(null);
    void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }
}

/**
 * The page to go to after signing in. Only a path inside this app is accepted, so a crafted
 * sign-in link cannot send the user anywhere else.
 */
export function safeReturnUrl(value: string | null): string {
  return value && /^\/(?![/\\])/.test(value) ? value : '/products';
}

function describeLoginError(error: unknown): string {
  const response = error instanceof HttpErrorResponse ? error : null;
  const code = (response?.error as AuthErrorBody | null)?.code;

  // 400 is a field the API rejects outright, such as one over 200 characters.
  if (response?.status === 401 || response?.status === 400) {
    return 'The username or password is not right.';
  }
  if (response?.status === 429) {
    const seconds = Number(response.headers.get('Retry-After'));
    return seconds > 0
      ? `Too many attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
      : 'Too many attempts. Try again shortly.';
  }
  if (code === 'auth_not_configured') {
    return 'Sign-in is not set up on the server.';
  }
  return 'Could not reach the server. Try again.';
}
