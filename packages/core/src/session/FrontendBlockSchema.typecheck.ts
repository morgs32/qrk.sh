import type { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import type {
  FrontendGenerationBoundaryBlockSchema,
  FrontendLineageBlockSchema,
  FrontendLineageTransitionRequiredSchema,
  FrontendReplicaBlockSchema,
  FrontendReplicaStateSchema,
  FrontendSyncStateSchema,
} from './FrontendBlockSchema.ts';
import type {
  IFrontendGenerationBoundaryBlock,
  IFrontendLineageBlock,
  IFrontendLineageTransitionRequired,
  IFrontendReplicaBlock,
  IFrontendReplicaState,
  IFrontendSyncState,
} from './types.ts';

assert<
  Equals<Schema.Schema.Type<typeof FrontendSyncStateSchema>, IFrontendSyncState>
>();
assert<
  Equals<
    Schema.Schema.Type<typeof FrontendReplicaStateSchema>,
    IFrontendReplicaState
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof FrontendGenerationBoundaryBlockSchema>,
    IFrontendGenerationBoundaryBlock
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof FrontendLineageBlockSchema>,
    IFrontendLineageBlock
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof FrontendReplicaBlockSchema>,
    IFrontendReplicaBlock
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof FrontendLineageTransitionRequiredSchema>,
    IFrontendLineageTransitionRequired
  >
>();
