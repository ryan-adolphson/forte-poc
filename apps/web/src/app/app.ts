import { NgOptimizedImage } from '@angular/common';
import { Component, inject, viewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { MatToolbar } from '@angular/material/toolbar';
import type { Product } from '@forte/chat-contract';
import { Catalogue } from './catalogue';
import { Chat } from './chat';
import { ChatPanel } from './chat-panel';

@Component({
  imports: [
    Catalogue,
    ChatPanel,
    MatButton,
    MatSidenav,
    MatSidenavContainer,
    MatSidenavContent,
    MatToolbar,
    NgOptimizedImage,
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly chat = inject(Chat);
  private readonly panel = viewChild.required(MatSidenav);

  /** Opens the chat panel about a product, or with `null` for general questions. */
  protected ask(product: Product | null): void {
    this.chat.selectProduct(product);
    void this.panel().open();
  }
}
