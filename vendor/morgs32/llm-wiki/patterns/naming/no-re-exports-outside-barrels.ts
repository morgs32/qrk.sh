import { OrderJsonSchema } from '../orders/OrderSchema.js';

/**
 * Only intentional `index.ts` barrels and worker entrypoints may aggregate exports.
 *
 * @bad `export { commandShape as commandShape } from './FrontendRepoTables.js'` in a tables module.
 * @bad Re-exporting a sibling schema from a feature/runtime module so importers use the wrong file.
 */
import { ApiKeyClaimsSchema } from './ApiKeyClaimsSchema.js';

export const verifyApiKey = (token: string) => {
  void ApiKeyClaimsSchema;
  void OrderJsonSchema;
  return token;
};
