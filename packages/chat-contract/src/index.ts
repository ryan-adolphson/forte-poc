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

/** One document in the documents list: the current revision of a product's data sheet. */
export interface DocumentSummary extends DataSheetReference {
  /** For example `Ready-Mix Concrete C32/40 - Product data sheet`. */
  title: string;
  sku: string;
  productName: string;
  /** The product's category slug, for example `concrete`. */
  category: string;
  /**
   * How many revisions of this document exist, counting the current one and every
   * superseded one. Only the count is exposed; superseded revisions cannot be read.
   */
  revisionCount: number;
}

/**
 * Body of GET /api/documents: the current revision of every document, ordered by category
 * then product name. Superseded revisions are never listed.
 */
export interface DocumentListResponse {
  documents: DocumentSummary[];
}

/** Which data sheet, at which revision. Always the revision that was current when it was read. */
export interface DataSheetReference {
  /** For example `DS-FRT-CON-C3240`. */
  documentNumber: string;
  /** For example `C`. */
  revision: string;
  /** ISO date, `yyyy-mm-dd`. */
  issueDate: string;
  /**
   * Path of the PDF on the API, for example `/api/documents/DS-FRT-CON-C3240/file`.
   * It has no revision in it and always serves the revision that is current when opened.
   */
  url: string;
}

/**
 * Where an answer came from. Built by the server from what the assistant's lookups
 * returned in that turn, never from text the model wrote.
 */
export type ChatSource =
  | {
      /** The current revision of a product data sheet. */
      kind: 'datasheet';
      sku: string;
      productName: string;
      /** For example `DS-FRT-CON-C3240`. */
      documentNumber: string;
      /** For example `C`. */
      revision: string;
      /** ISO date, `yyyy-mm-dd`. */
      issueDate: string;
      /**
       * Path of the PDF on the API, for example `/api/documents/DS-FRT-CON-C3240/file`.
       * It has no revision in it and always serves the revision that is current when opened.
       */
      url: string;
    }
  | {
      /** A product's entry in the catalogue. */
      kind: 'catalogue';
      sku: string;
      productName: string;
      /**
       * The product's current data sheet, when it has one: the document of record for the
       * product. The answer was read from the catalogue, not from this document.
       */
      dataSheet?: DataSheetReference;
    };

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
  /**
   * `sources`: what the answer drew on, data sheets first. Empty when the answer used no
   * source, for example when the assistant declined. At most 8.
   */
  done: { interactionId: string; usage: ChatUsage | null; sources: ChatSource[] };
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
