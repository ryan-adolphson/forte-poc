const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-01-19` becomes `19 Jan 2026`. Anything else is shown as it came. */
export function formatIssueDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = match && MONTHS[Number(match[2]) - 1];
  return match && month ? `${Number(match[3])} ${month} ${match[1]}` : iso;
}

/**
 * The only links this app makes from API data: the API's own data sheet files. Anything else
 * (another origin, another scheme, `//host`, a backslash trick) is shown as text, not as a link.
 */
export function isDocumentUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('/api/documents/') && !url.includes('\\');
}
