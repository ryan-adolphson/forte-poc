import { getDocumentProxy } from 'unpdf';

const SUPERSCRIPTS: Record<string, string> = { '2': '²', '3': '³' };

/**
 * Extracts the text of a PDF as plain lines, for search and for the model to read.
 *
 * Lines follow the PDF's own line breaks, so a table row reads "Property Value Standard".
 * A PDF has no superscript character: "kg/m³" is drawn as "kg/m" followed by a smaller,
 * raised "3". That digit is turned back into "³" (or "²"), so a unit never reads "kg/m3".
 * Whitespace is collapsed and empty lines are dropped.
 */
export async function extractPdfText(content: Uint8Array): Promise<string> {
  // pdf.js takes ownership of the buffer it is given, so it gets a copy.
  const pdf = await getDocumentProxy(content.slice());
  let text = '';
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    let previous: { height: number; baseline: number } | undefined;
    for (const item of (await page.getTextContent()).items) {
      if (!('str' in item)) continue;
      const baseline = Number(item.transform[5]);
      const raisedAndSmaller =
        previous !== undefined && item.height < previous.height && baseline > previous.baseline;
      text += raisedAndSmaller ? (SUPERSCRIPTS[item.str] ?? item.str) : item.str;
      if (item.hasEOL) text += '\n';
      // Spacing items have no height; they do not reset what "the text before" was.
      if (item.height > 0) previous = { height: item.height, baseline };
    }
    text += '\n';
  }

  return text
    .normalize('NFC')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}
