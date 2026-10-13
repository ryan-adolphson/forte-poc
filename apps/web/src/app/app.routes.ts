import { Routes } from '@angular/router';

/** Every page is loaded on demand, so the first load carries only the shell. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'products' },
  {
    path: 'products',
    title: 'Products – Forte',
    loadComponent: () => import('./products-page').then((m) => m.ProductsPage),
  },
  {
    path: 'documents',
    title: 'Documents – Forte',
    loadComponent: () => import('./documents-page').then((m) => m.DocumentsPage),
  },
  {
    path: 'forte-ai',
    title: 'Forte AI – Forte',
    loadComponent: () => import('./forte-ai-page').then((m) => m.ForteAiPage),
  },
  { path: '**', redirectTo: 'products' },
];
