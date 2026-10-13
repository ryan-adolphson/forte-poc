import { dataSheetSource } from '../sources.js';
import { optionalString, type ChatTool } from './tool.js';

export const getDataSheetTool: ChatTool = {
  declaration: {
    type: 'function',
    name: 'get_data_sheet',
    description:
      "Fetches the product data sheet of one product by the product's exact SKU. Use it for what " +
      'only the data sheet holds: handling and storage instructions (placing, curing, storing, ' +
      'cutting, delivery), the document number, the revision and issue date, and the revision ' +
      'history; and whenever the user asks what the data sheet says. For catalogue properties ' +
      'alone, get_product is enough. Returns { found: true, dataSheet } with documentNumber, ' +
      'revision, issueDate (yyyy-mm-dd), title, sku, productName and text (the full text of the ' +
      'sheet: description, technical properties, handling and storage, revision history), or ' +
      '{ found: false } when there is no data sheet for that SKU. The result is always the latest ' +
      'revision of the sheet. No tool can fetch an earlier revision.',
    parameters: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description:
            'The product SKU, for example "FRT-CON-C3240". Case-insensitive. Not the document ' +
            'number. If you only know the product name, find the SKU with search_products first.',
        },
      },
      required: ['sku'],
    },
  },

  async run(args, _products, documents) {
    const sku = optionalString(args, 'sku', 50);
    if (typeof sku === 'object') return sku;
    if (sku === undefined) return { ok: false, error: '"sku" is required.' };

    const dataSheet = await documents.getCurrentForSku(sku);
    // An unknown SKU, a hidden product and a product with no data sheet all arrive as null.
    if (dataSheet === null) return { ok: true, data: { found: false } };
    return {
      ok: true,
      data: { found: true, dataSheet },
      sources: [{ source: dataSheetSource(dataSheet), direct: true }],
    };
  },
};
