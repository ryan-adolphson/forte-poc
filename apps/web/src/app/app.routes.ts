import { Routes } from '@angular/router';
import { signedIn, signedOut } from './auth-guards';

/** Every page is loaded on demand, so the first load carries only the shell. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'products' },
  {
    path: 'login',
    title: 'Sign in – Forte',
    canActivate: [signedOut],
    loadComponent: () => import('./login-page').then((m) => m.LoginPage),
  },
  {
    path: 'products',
    title: 'Products – Forte',
    canActivate: [signedIn],
    loadComponent: () => import('./products-page').then((m) => m.ProductsPage),
  },
  {
    path: 'documents',
    title: 'Documents – Forte',
    canActivate: [signedIn],
    loadComponent: () => import('./documents-page').then((m) => m.DocumentsPage),
  },
  {
    path: 'forte-ai',
    title: 'Forte AI – Forte',
    canActivate: [signedIn],
    loadComponent: () => import('./forte-ai-page').then((m) => m.ForteAiPage),
  },
  {
    path: 'settings',
    title: 'Settings – Forte',
    canActivate: [signedIn],
    loadComponent: () => import('./settings-page').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: 'products' },
];
