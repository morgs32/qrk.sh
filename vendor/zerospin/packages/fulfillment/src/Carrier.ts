import { Context, type Effect } from 'effect';

export class Carrier extends Context.Service<
  Carrier,
  (fulfillment: { id: string; warehouseCode?: string }) => Effect.Effect<string>
>()('Carrier') {}
