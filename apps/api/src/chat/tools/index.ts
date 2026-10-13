import { getProductTool } from './get-product.tool.js';
import { listCategoriesTool } from './list-categories.tool.js';
import { searchProductsTool } from './search-products.tool.js';
import type { ChatTool } from './tool.js';

/** Every tool the assistant has. See README.md in this folder to add one. */
export const chatTools: ChatTool[] = [searchProductsTool, getProductTool, listCategoriesTool];
