import type { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import type {
  AggregateFrontendBlockSchema,
  AggregateFrontendReplicaBlockSchema,
  AggregateFrontendReplicaStateSchema,
  AggregateFrontendSyncStateSchema,
} from './AggregateFrontendBlockSchema.ts';
import type {
  IAggregateFrontendBlock,
  IAggregateFrontendReplicaBlock,
  IAggregateFrontendReplicaState,
  IAggregateFrontendSyncState,
} from './types.ts';

assert<
  Equals<
    Schema.Schema.Type<typeof AggregateFrontendSyncStateSchema>,
    IAggregateFrontendSyncState
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof AggregateFrontendReplicaStateSchema>,
    IAggregateFrontendReplicaState
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof AggregateFrontendBlockSchema>,
    IAggregateFrontendBlock
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof AggregateFrontendReplicaBlockSchema>,
    IAggregateFrontendReplicaBlock
  >
>();
