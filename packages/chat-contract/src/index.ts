/** Body of POST /api/chat/stream. */
export interface ChatRequest {
  /** The user's message. 1 to 2000 characters. */
  message: string;
  /** `interactionId` from the previous turn's `done` event, to continue that conversation. */
  previousInteractionId?: string;
  /**
   * SKU of the product the user is looking at while asking, so "its strength" means that
   * product. An unknown SKU is ignored: the message is answered as if none was sent.
   */
  productSku?: string;
}

/**
 * One measured or declared property of a product. A `type`, not an `interface`, on
 * purpose: the API stores these in a JSON column, and only a type alias is assignable to
 * a JSON value type.
 */
export type ProductProperty = {
  name: string;
  value: number | string;
  unit?: string;
  /** The test or product standard the value refers to, where one exists. */
  standard?: string;
};

export interface Product {
  sku: string;
  name: string;
  category: string;
  description: string;
  properties: ProductProperty[];
}

/** Body of GET /api/products: every product, ordered by category then name. */
export interface ProductListResponse {
  products: Product[];
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type ChatErrorCode =
  | 'not_configured'
  | 'rate_limited'
  | 'invalid_request'
  | 'tool_limit'
  | 'model_error';

/** Server-sent events on the chat stream. `event:` is the key, `data:` is the JSON value. */
export interface ChatEventMap {
  start: Record<string, never>;
  tool: { name: string; status: 'started' | 'finished' };
  text: { delta: string };
  done: { interactionId: string; usage: ChatUsage | null };
  error: { code: ChatErrorCode; message: string };
}

export type ChatEventName = keyof ChatEventMap;

export type ChatEvent = {
  [K in ChatEventName]: { event: K; data: ChatEventMap[K] };
}[ChatEventName];

/** JSON body of a non-stream error response, such as HTTP 429. */
export interface ChatErrorBody {
  code: ChatErrorCode;
  message: string;
}
