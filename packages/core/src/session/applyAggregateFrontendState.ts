import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import type { IDrizzleRelationsFromModels } from '../drizzle/types.ts';
import type {
  IAggregateFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { AggregateFrontendSyncStateSchema } from './AggregateFrontendCommandSchema.ts';
import {
  applyAggregateFrontendStateTx,
  Db,
} from './applyAggregateFrontendStateTx.ts';
import type {
  IAggregateFrontendSyncState,
  ISessionDrizzleDb,
  ISessionId,
} from './types.ts';

export const applyAggregateFrontendState = Effect.fn(
  'applyAggregateFrontendState',
)(function* <FRONTEND extends IAggregateFrontendController>(props: {
  db: ISessionDrizzleDb<
    InferFrontendModels<FRONTEND>,
    IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
  >;
  frontend: FRONTEND;
  sessionId: ISessionId;
  models: InferFrontendModels<FRONTEND>;
  frontendState: IAggregateFrontendSyncState;
  aggregateId: IAggregateFrontendSyncState['aggregateId'];
  userId: IAggregateFrontendSyncState['userId'];
  systemId: IAggregateFrontendSyncState['systemId'];
}): Effect.fn.Return<void, IAnyError> {
  const {
    aggregateId,
    db,
    frontend,
    frontendState,
    models,
    sessionId,
    systemId,
    userId,
  } = props;

  yield* Schema.encodeEffect(AggregateFrontendSyncStateSchema)(frontendState, {
    onExcessProperty: 'error',
  }).pipe(
    mapParseError({
      code: 'aggregate-frontend-state-encode-failed',
      prefix: 'Failed to encode aggregate frontend state',
    }),
  );

  if (
    frontendState.aggregateId !== aggregateId ||
    frontendState.userId !== userId ||
    frontendState.systemId !== systemId ||
    frontendState.aggregateName !== frontend.aggregateName ||
    frontendState.frontendName !== frontend.name ||
    frontendState.aggregateVersion !== frontend.aggregateVersion
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-state-target-mismatch',
      message: 'Aggregate frontend state does not match the bound target',
    });
  }

  if (
    new Set(frontendState.resolutions.map(entry => entry.command.id)).size !==
    frontendState.resolutions.length
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-state-resolved-command-duplicate',
      message:
        'Aggregate frontend state contains duplicate resolved command IDs',
    });
  }

  for (const { command } of frontendState.resolutions) {
    if (
      command.aggregateId !== aggregateId ||
      command.aggregateName !== frontend.aggregateName ||
      command.userId !== userId ||
      command.frontendName !== frontend.name ||
      command.aggregateIndex > frontendState.aggregateIndex ||
      command.dispositionHash === null
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-resolution-invalid',
        message:
          'Snapshot resolution does not match the bound view and captured position',
      });
    }
  }

  for (const resource of frontendState.resources) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: resource.modelName,
      recordKind: 'frontend models',
    });
    yield* Schema.decodeUnknownEffect(makeEffectSchema(model.propertiesShape))(
      resource,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'aggregate-frontend-state-resource-invalid',
        prefix: `Failed to decode aggregate frontend state resource ${resource.modelName}.${resource.id}`,
      }),
    );
  }

  yield* applyAggregateFrontendStateTx({
    frontendState,
    sessionId,
    models,
  }).pipe(Effect.provideService(Db, db));
});
