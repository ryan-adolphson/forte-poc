import { NgOptimizedImage } from '@angular/common';
import { Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatCard } from '@angular/material/card';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth, safeReturnUrl } from './auth';

/** The sign-in page. It is shown without the shell's toolbar and navigation. */
@Component({
  imports: [
    FormField,
    MatButton,
    MatCard,
    MatError,
    MatFormField,
    MatInput,
    MatLabel,
    MatProgressSpinner,
    NgOptimizedImage,
  ],
  selector: 'app-login-page',
  styleUrl: './login-page.css',
  templateUrl: './login-page.html',
})
export class LoginPage {
  private readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly username = viewChild.required<ElementRef<HTMLInputElement>>('username');
  private readonly password = viewChild.required<ElementRef<HTMLInputElement>>('password');

  private readonly credentials = signal({ username: '', password: '' });
  protected readonly form = form(this.credentials, (path) => {
    required(path.username);
    required(path.password);
  });
  /** Why the last attempt failed. */
  protected readonly error = signal<string | null>(null);

  constructor() {
    afterNextRender(() => this.username().nativeElement.focus());
  }

  /** Runs only with both fields filled in; otherwise the fields show what is missing. */
  protected signIn(event: Event): void {
    event.preventDefault();
    void submit(this.form, async () => {
      this.error.set(null);
      const { username, password } = this.credentials();
      const error = await this.auth.login(username, password);
      if (error) {
        this.error.set(error);
        this.form.password().reset(''); // emptied, and not yet marked as missing
        this.password().nativeElement.focus();
        return;
      }
      await this.router.navigateByUrl(
        safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')),
      );
    });
  }
}
