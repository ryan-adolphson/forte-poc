import { BreakpointObserver } from '@angular/cdk/layout';
import { NgOptimizedImage } from '@angular/common';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatListItem, MatListItemIcon, MatNavList } from '@angular/material/list';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { MatToolbar } from '@angular/material/toolbar';
import {
  NavigationEnd,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { map } from 'rxjs';
import { ChatDrawer } from './chat-drawer';
import { ChatPanel } from './chat-panel';

@Component({
  imports: [
    ChatPanel,
    MatIconButton,
    MatListItem,
    MatListItemIcon,
    MatNavList,
    MatSidenav,
    MatSidenavContainer,
    MatSidenavContent,
    MatToolbar,
    NgOptimizedImage,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly drawer = inject(ChatDrawer);
  private readonly injector = inject(Injector);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  /** The destinations of the side navigation. `icon` is the path of a 24 by 24 line icon. */
  protected readonly links = [
    {
      path: '/products',
      label: 'Products',
      icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    },
    {
      path: '/documents',
      label: 'Documents',
      icon: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
    },
    {
      path: '/forte-ai',
      label: 'Forte AI',
      icon: 'M4 5h16v11h-9l-5 4v-4H4zM8 9h8M8 12h5',
    },
  ];

  /** Below 960px the navigation is hidden and opens over the page from the menu button. */
  protected readonly narrow = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 959.98px)')
      .pipe(map((state) => state.matches)),
    { requireSync: true },
  );
  /** Whether the navigation is open on a narrow screen. Crossing the breakpoint closes it. */
  protected readonly navOpen = linkedSignal({ source: this.narrow, computation: () => false });

  constructor() {
    let first = true;
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          // The chat panel belongs to the page it was opened on, and the Forte AI page shows the
          // same conversation: the panel must be gone before another page renders.
          this.drawer.opened.set(false);
          this.navOpen.set(false);
        } else if (event instanceof NavigationEnd) {
          if (!first) {
            afterNextRender(() => this.showPageTop(), { injector: this.injector });
          }
          first = false; // the first page keeps the browser's own focus and scroll position
        }
      });
  }

  /** Scrolls to the top of the page and moves focus to its heading. */
  protected showPageTop(event?: Event): void {
    event?.preventDefault(); // the skip link: with `<base href="/">` its `#` would leave the page
    const main = this.main().nativeElement;
    main.scrollTop = 0;
    main.querySelector<HTMLElement>('h2')?.focus();
  }
}
