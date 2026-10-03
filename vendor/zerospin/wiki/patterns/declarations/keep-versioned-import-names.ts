/** Keep a versioned declaration's exported name visible at import and use sites.
 * Use explicit object keys when a registry needs an unversioned key.
 *
 * @bad Import `fulfillmentV3 as fulfillment` or `purchaseV3 as purchase` to hide the version.
 */
import { fulfillmentV3 } from './fulfillmentV3';
import { purchaseV3 } from './purchaseV3';

export const modules = {
  purchase: purchaseV3,
  fulfillment: fulfillmentV3,
};
