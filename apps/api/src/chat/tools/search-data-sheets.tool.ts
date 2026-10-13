import { dataSheetSource } from '../sources.js';
import { optionalString, type ChatTool } from './tool.js';

export const searchDataSheetsTool: ChatTool = {
  declaration: {
    type: 'function',
    name: 'search_data_sheets',
    description:
      'Searches the text of the product data sheets by keyword. Use it when the question is about ' +
      'data sheet content and you do not know which product it concerns, or it spans products, ' +
      'for example which products must be protected from frost. When you know the product, use ' +
      'get_data_sheet instead. Returns { count, dataSheets }, at most 5, each with ' +
      'documentNumber, revision, issueDate (yyyy-mm-dd), title, sku, productName and text (the ' +
      'full text of the sheet). An empty list means no data sheet contains all the keywords: try ' +
      'fewer or different ones. More may match than the 5 returned, so do not present the result ' +
      'as a complete list. Every result is the latest revision of its sheet. No tool can fetch an ' +
      'earlier revision.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'One to three literal keywords separated by spaces, for example "frost" or "curing ' +
            'days". Every keyword must appear (case-insensitive) in the title or text of a sheet, ' +
            'so use single words that would be printed on it, not a sentence.',
        },
      },
      required: ['query'],
    },
  },

  async run(args, _products, documents) {
    const query = optionalString(args, 'query', 200);
    if (typeof query === 'object') return query;
    if (query === undefined) return { ok: false, error: '"query" is required.' };

    const dataSheets = await documents.searchCurrent(query);
    return {
      ok: true,
      data: { count: dataSheets.length, dataSheets },
      sources: dataSheets.map((sheet) => ({ source: dataSheetSource(sheet), direct: false })),
    };
  },
};
