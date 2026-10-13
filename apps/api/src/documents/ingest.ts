import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { DocumentsService } from './documents.service.js';
import { extractPdfText } from './pdf-text.js';

/**
 * Loads the product data sheets into the database: every revision in the manifest, the
 * superseded ones too. Run with `npm run db:ingest-docs -w api`. Safe to re-run.
 *
 * The folder holds `manifest.json` and the PDFs it names. It defaults to
 * `sample-documents` at the repo root; set DOCS_DIR to read another folder.
 *
 * Which revision is current is decided by `DocumentsService.ingest` from the issue dates.
 * The manifest's own `current` flag is never passed on; it is only compared with the
 * database afterwards, and a difference is printed as a warning.
 */
type ManifestEntry = {
  sku: string;
  productName: string;
  documentNumber: string;
  revision: string;
  issueDate: string;
  current: boolean;
  file: string;
  change?: string;
};

const docsDir = process.env.DOCS_DIR
  ? resolve(process.env.DOCS_DIR)
  : resolve(import.meta.dirname, '../../../../sample-documents');
const manifest = JSON.parse(await readFile(resolve(docsDir, 'manifest.json'), 'utf8')) as ManifestEntry[];

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
const documents = app.get(DocumentsService);

for (const entry of manifest) {
  const content = new Uint8Array(await readFile(resolve(docsDir, entry.file)));
  await documents.ingest({
    documentNumber: entry.documentNumber,
    revision: entry.revision,
    title: `${entry.productName} - Product data sheet`,
    sku: entry.sku,
    issueDate: entry.issueDate,
    changeNote: entry.change,
    text: await extractPdfText(content),
    fileName: entry.file.split('/').at(-1)!,
    content,
  });
}

// Ask the database which revision it now serves for each document number.
const documentNumbers = [...new Set(manifest.map((entry) => entry.documentNumber))].sort();
let warnings = 0;
console.log(`Ingested ${manifest.length} revisions of ${documentNumbers.length} documents from ${docsDir}`);
for (const documentNumber of documentNumbers) {
  const revisions = manifest.filter((entry) => entry.documentNumber === documentNumber);
  const expected = revisions.find((entry) => entry.current)?.revision;
  const served = (await documents.getCurrentFile(documentNumber))?.revision;
  console.log(
    `  ${documentNumber}: current Rev ${served ?? '(none served)'}` +
      (revisions.length > 1 ? ` of ${revisions.map((entry) => entry.revision).join(', ')}` : ''),
  );
  if (served !== expected) {
    warnings += 1;
    console.warn(
      `  WARNING ${documentNumber}: the manifest marks Rev ${expected ?? '(none)'} as current, but the ` +
        `database serves Rev ${served ?? '(none: the product is hidden from the assistant, or nothing is current)'}.`,
    );
  }
}
console.log(warnings === 0 ? 'The database agrees with the manifest on every current revision.' : `${warnings} warning(s).`);
await app.close();
