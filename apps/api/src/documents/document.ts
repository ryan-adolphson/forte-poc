/** The current revision of a document, as the assistant reads it. */
export interface DocumentText {
  /** For example `DS-FRT-CON-C3240`. */
  documentNumber: string;
  /** For example `C`. Always the current revision. */
  revision: string;
  /** ISO date, `yyyy-mm-dd`. */
  issueDate: string;
  title: string;
  sku: string;
  productName: string;
  /** Extracted full text of the PDF. */
  text: string;
}

/** Which document is current for a product, without its text. */
export type DocumentReference = Pick<DocumentText, 'documentNumber' | 'revision' | 'issueDate'>;

/**
 * One row of the documents list: a current revision without its text, plus its product's
 * category and how many revisions of the document are stored (superseded ones included).
 */
export type DocumentListItem = Omit<DocumentText, 'text'> & {
  category: string;
  revisionCount: number;
};

/** The current revision's PDF, for the download endpoint. */
export interface DocumentFile {
  documentNumber: string;
  revision: string;
  fileName: string;
  content: Uint8Array;
}

/** One revision of one document, as the ingestion script supplies it. */
export interface DocumentIngest {
  documentNumber: string;
  revision: string;
  title: string;
  /** Exact SKU of an existing product (visible or hidden). */
  sku: string;
  /** ISO date, `yyyy-mm-dd`. */
  issueDate: string;
  changeNote?: string;
  text: string;
  fileName: string;
  content: Uint8Array;
}
