import { getDataSheetTool } from './get-data-sheet.tool.js';
import { getProductTool } from './get-product.tool.js';
import { listCategoriesTool } from './list-categories.tool.js';
import { listProductsTool } from './list-products.tool.js';
import { searchDataSheetsTool } from './search-data-sheets.tool.js';
import { searchProductsTool } from './search-products.tool.js';
import type { ChatTool } from './tool.js';

/** Every tool the assistant has. See README.md in this folder to add one. */
export const chatTools: ChatTool[] = [
  searchProductsTool,
  getProductTool,
  listProductsTool,
  listCategoriesTool,
  getDataSheetTool,
  searchDataSheetsTool,
];
