import { BreakpointObserver } from '@angular/cdk/layout';
import { NgOptimizedImage } from '@angular/common';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
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
import { Auth } from './auth';
import { Chat } from './chat';
import { ChatDrawer } from './chat-drawer';
import { ChatPanel } from './chat-panel';

@Component({
  imports: [
    ChatPanel,
    MatButton,
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
  protected readonly auth = inject(Auth);
  protected readonly drawer = inject(ChatDrawer);
  private readonly chat = inject(Chat);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
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

  /**
   * Whether the toolbar, the navigation and the chat panel are shown: on every page but the
   * sign-in page, and not before the first page is known. Set when a navigation ends, so the
   * shell and the page change together.
   */
  protected readonly chrome = signal(false);

  constructor() {
    let first = true;
    this.router.events
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          // The chat panel belongs to the page it was opened on, and the Forte AI page shows the
          // same conversation: the panel must be gone before another page renders.
          this.drawer.opened.set(false);
          this.navOpen.set(false);
        } else if (event instanceof NavigationEnd) {
          this.chrome.set(!event.urlAfterRedirects.startsWith('/login'));
          if (!first) {
            afterNextRender(() => this.showPageTop(), { injector: this.injector });
          }
          first = false; // the first page keeps the browser's own focus and scroll position
        }
      });
  }

  /** Signs out and forgets the conversation and the product it was about. */
  protected async signOut(): Promise<void> {
    await this.auth.logout();
    this.drawer.opened.set(false);
    this.chat.selectProduct(null);
    this.chat.newChat();
    await this.router.navigateByUrl('/login');
  }

  /** Scrolls to the top of the page and moves focus to its heading. */
  protected showPageTop(event?: Event): void {
    event?.preventDefault(); // the skip link: with `<base href="/">` its `#` would leave the page
    const main = this.main().nativeElement;
    main.scrollTop = 0;
    main.querySelector<HTMLElement>('h2')?.focus();
  }
}
