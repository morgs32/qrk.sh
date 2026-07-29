import type { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import type {
  ServiceFrontendBlockSchema,
  ServiceFrontendGenerationBoundaryBlockSchema,
  ServiceFrontendLineageBlockSchema,
  ServiceFrontendLineageTransitionRequiredSchema,
  ServiceFrontendReplicaBlockSchema,
  ServiceFrontendReplicaStateSchema,
  ServiceFrontendStateSchema,
} from './ServiceFrontendBlockSchema.ts';
import type {
  IServiceFrontendBlock,
  IServiceFrontendGenerationBoundaryBlock,
  IServiceFrontendLineageBlock,
  IServiceFrontendLineageTransitionRequired,
  IServiceFrontendReplicaBlock,
  IServiceFrontendReplicaState,
  IServiceFrontendState,
  IServiceSession,
} from './types.ts';

assert<
  Equals<
    Schema.Schema.Type<typeof ServiceFrontendBlockSchema>,
    IServiceFrontendBlock
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof ServiceFrontendStateSchema>,
    IServiceFrontendState
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof ServiceFrontendReplicaStateSchema>,
    IServiceFrontendReplicaState
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof ServiceFrontendGenerationBoundaryBlockSchema>,
    IServiceFrontendGenerationBoundaryBlock
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof ServiceFrontendLineageBlockSchema>,
    IServiceFrontendLineageBlock
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof ServiceFrontendReplicaBlockSchema>,
    IServiceFrontendReplicaBlock
  >
>();
assert<
  Equals<
    Schema.Schema.Type<typeof ServiceFrontendLineageTransitionRequiredSchema>,
    IServiceFrontendLineageTransitionRequired
  >
>();

declare const replicaState: IServiceFrontendReplicaState;
declare const replicaBlock: IServiceFrontendReplicaBlock;
declare const serviceSession: IServiceSession;

void (replicaState.frontendVersion satisfies string);
void (replicaState.replicaIndex satisfies number);
void (replicaBlock.lineageBlock satisfies IServiceFrontendLineageBlock);

// @ts-expect-error Service replicas never expose an account command journal.
void replicaState.stagedCommands;
// @ts-expect-error Service replica blocks never carry local command mutations.
void replicaBlock.stagedCommandsAdded;
// @ts-expect-error Read-only service sessions cannot stage commands.
void serviceSession.stageCommand;
// @ts-expect-error Read-only service sessions have no push surface.
void serviceSession.pushCommands;
// @ts-expect-error Read-only service sessions have no query RPC surface.
void serviceSession.query;
