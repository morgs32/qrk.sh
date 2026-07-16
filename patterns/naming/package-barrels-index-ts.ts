/**
 * Barrels are `index.ts`; `types.ts` defines types inline — no re-exporting type aliases from siblings.
 *
 * @bad `export type { IEncodedOrder } from './OrderSchema.js'` in `types.ts`.
 * @bad Re-exporting interfaces from runtime modules instead of defining them inline in `types.ts`.
 */
import type { InventoryApi } from './InventoryApi/InventoryApi.js';
import type { OrdersApi } from './OrdersApi/OrdersApi.js';
import type { orderShape } from './orders/OrderSchema.js';

type InferDecodedShape<T> = T extends { readonly _decoded: infer D }
  ? D
  : never;

export type { InventoryApi, OrdersApi };

export type IEncodedOrder = InferDecodedShape<typeof orderShape>;
