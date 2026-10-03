import type { InferCommands } from '../contracts/InferCommands.ts';
import type { DeclaredKeys } from '../utils/DeclaredKeys.ts';

import type { IAggregateRegistry } from './types.ts';

/** The command vocabulary across all declared versions of one aggregate. */
export type InferAggregateCommands<
  AGGREGATE_REGISTRY extends IAggregateRegistry,
> = {
  [VERSION in DeclaredKeys<AGGREGATE_REGISTRY>]: InferCommands<
    AGGREGATE_REGISTRY[VERSION]['contracts']
  >;
}[DeclaredKeys<AGGREGATE_REGISTRY>];
