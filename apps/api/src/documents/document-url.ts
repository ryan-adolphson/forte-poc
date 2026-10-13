/**
 * Path of a document's PDF on the API (`DocumentsController.file`). No revision in the
 * link: the endpoint serves whatever is current when it is opened.
 */
export function documentUrl(documentNumber: string): string {
  return `/api/documents/${encodeURIComponent(documentNumber)}/file`;
}
