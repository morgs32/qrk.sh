import type { InferModelOperations } from '../contracts/InferModelOperations.ts';
import type { DeclaredKeys } from '../utils/DeclaredKeys.ts';

import type { IAggregateRegistry } from './types.ts';
/** All permitted contract outputs across an aggregate's versions. */
export type InferAggregateOperations<
  AGGREGATE_REGISTRY extends IAggregateRegistry,
> = {
  [VERSION in DeclaredKeys<AGGREGATE_REGISTRY>]: InferModelOperations<
    AGGREGATE_REGISTRY[VERSION]['models']
  >;
}[DeclaredKeys<AGGREGATE_REGISTRY>];
