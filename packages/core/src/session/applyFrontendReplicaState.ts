import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { makeTx } from '../drizzle/makeTx.ts';
import type { IDrizzleRelationsFromModels } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import type {
  IFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';

import { applyFrontendState } from './applyFrontendState.ts';
import { sessionStagedCommandDrizzleSchema } from './sessionCommandShape.ts';
import type {
  IFrontendReplicaState,
  ISessionDrizzleDb,
  ISessionSchema,
} from './types.ts';

export const applyFrontendReplicaState = Effect.fn('applyFrontendReplicaState')(
  function* <FRONTEND extends IFrontendController>(props: {
    frontend: FRONTEND;
    db: ISessionDrizzleDb<
      InferFrontendModels<FRONTEND>,
      IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
    >;
    schema: ISessionSchema<InferFrontendModels<FRONTEND>>;
    models: InferFrontendModels<FRONTEND>;
    frontendReplicaState: IFrontendReplicaState;
  }): Effect.fn.Return<void, IAnyError> {
    const { db, frontend, models, schema, frontendReplicaState } = props;

    yield* applyFrontendState({
      frontend,
      db,
      schema,
      models,
      frontendState: frontendReplicaState,
    });

    yield* makeTx({
      db,
      program: Effect.fn('applyFrontendReplicaState.insertStagedCommands')(
        function* ({ tx }) {
          yield* Effect.void;
          for (const command of frontendReplicaState.stagedCommands) {
            upsertHelper({
              table: sessionStagedCommandDrizzleSchema,
              tx,
              values: command,
            });
          }
        },
      ),
    });
  },
);
