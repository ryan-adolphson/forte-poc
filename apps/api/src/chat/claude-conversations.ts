import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';

/** Every Claude conversation id starts with this, so it is never mistaken for a Gemini one. */
export const CLAUDE_CONVERSATION_PREFIX = 'claude_';
/** A conversation not used for this long is forgotten. */
export const CONVERSATION_IDLE_MS = 2 * 60 * 60 * 1000;
/** Most conversations kept; the least recently used goes first. */
export const MAX_CONVERSATIONS = 500;
/**
 * A conversation that already holds this many messages is not continued: the next turn
 * starts a fresh one. History is never shortened in place, because Claude's thinking
 * blocks are only valid in an unedited (append-only) history.
 */
export const MAX_CONVERSATION_MESSAGES = 60;

/**
 * Claude's API is stateless, so the API process keeps each Claude conversation's message
 * list in memory (Gemini keeps its own on Google's side). Lost on restart; not shared
 * between API instances. Holds conversation text: never log it.
 */
@Injectable()
export class ClaudeConversations {
  /** Map order is least recently used first. */
  private readonly entries = new Map<string, { messages: BetaMessageParam[]; usedAt: number }>();

  /**
   * The stored messages of a conversation, or undefined for an unknown, expired or full
   * one (the turn then starts a fresh conversation).
   */
  get(id: string | undefined): BetaMessageParam[] | undefined {
    if (id === undefined || !id.startsWith(CLAUDE_CONVERSATION_PREFIX)) return undefined;
    const entry = this.entries.get(id);
    if (entry === undefined) return undefined;
    const now = Date.now();
    if (now - entry.usedAt > CONVERSATION_IDLE_MS || entry.messages.length >= MAX_CONVERSATION_MESSAGES) {
      this.entries.delete(id);
      return undefined;
    }
    this.touch(id, entry.messages, now);
    return [...entry.messages];
  }

  /**
   * Stores a finished turn's full message list, under `id` when the turn continued a
   * conversation, otherwise under a new id. Returns the id.
   */
  save(id: string | undefined, messages: BetaMessageParam[]): string {
    const key = id ?? `${CLAUDE_CONVERSATION_PREFIX}${randomUUID()}`;
    const now = Date.now();
    this.touch(key, [...messages], now);
    // Oldest first: drop the expired ones, then the least recently used over the cap.
    for (const [oldest, entry] of this.entries) {
      if (this.entries.size <= MAX_CONVERSATIONS && now - entry.usedAt <= CONVERSATION_IDLE_MS) break;
      this.entries.delete(oldest);
    }
    return key;
  }

  get size(): number {
    return this.entries.size;
  }

  private touch(id: string, messages: BetaMessageParam[], now: number): void {
    this.entries.delete(id);
    this.entries.set(id, { messages, usedAt: now });
  }
}
