import type { Interactions } from '@google/genai';
import type { DocumentsService } from '../../documents/documents.service.js';
import type { ProductsService } from '../../products/products.service.js';
import type { SourceCandidate } from '../sources.js';

/**
 * What a tool hands back to the model. A failure is a result too: the model reads the
 * error and can correct its call, so a bad argument never ends the turn.
 */
export type ToolResult =
  | {
      ok: true;
      /** Sent to the model as JSON. */
      data: unknown;
      /**
       * The records in `data` that an answer can be attributed to (see `../sources.ts`).
       * Never sent to the model: the citations shown to the user are built from this.
       */
      sources?: SourceCandidate[];
    }
  | { ok: false; error: string };

export interface ChatTool {
  /** The function declaration sent to Gemini on every request. */
  declaration: Interactions.Function & { name: string };
  /** `args` comes from the model and is untrusted: validate before use. */
  run(
    args: Record<string, unknown>,
    products: ProductsService,
    documents: DocumentsService,
  ): Promise<ToolResult>;
}

/**
 * Reads an optional string argument. Returns the trimmed string, `undefined` when it is
 * absent or blank, or a ToolResult error when it has the wrong type or is too long.
 */
export function optionalString(
  args: Record<string, unknown>,
  name: string,
  maxLength: number,
): string | undefined | { ok: false; error: string } {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    return { ok: false, error: `"${name}" must be a string.` };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { ok: false, error: `"${name}" must be at most ${maxLength} characters.` };
  }
  return trimmed === '' ? undefined : trimmed;
}
