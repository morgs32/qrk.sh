import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import type { IDrizzleRelationsFromModels } from '../drizzle/types.ts';
import type {
  IAggregateFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { AggregateFrontendSnapshotSchema } from './AggregateSelectedCommandSchema.ts';
import {
  applyAggregateFrontendSnapshotTx,
  Db,
} from './applyAggregateFrontendSnapshotTx.ts';
import type {
  IAggregateFrontendSnapshot,
  ISessionDrizzleDb,
  ISessionId,
} from './types.ts';

export const applyAggregateFrontendSnapshot = Effect.fn(
  'applyAggregateFrontendSnapshot',
)(function* <FRONTEND extends IAggregateFrontendController>(props: {
  db: ISessionDrizzleDb<
    InferFrontendModels<FRONTEND>,
    IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
  >;
  frontend: FRONTEND;
  sessionId: ISessionId;
  models: InferFrontendModels<FRONTEND>;
  snapshot: IAggregateFrontendSnapshot;
  aggregateId: IAggregateFrontendSnapshot['aggregateId'];
  authentication: IAggregateFrontendSnapshot['authentication'];
}): Effect.fn.Return<void, IAnyError> {
  const {
    aggregateId,
    db,
    frontend,
    snapshot,
    models,
    sessionId,
    authentication,
  } = props;

  yield* Schema.encodeEffect(AggregateFrontendSnapshotSchema)(snapshot, {
    onExcessProperty: 'error',
  }).pipe(
    mapParseError({
      code: 'aggregate-frontend-state-encode-failed',
      prefix: 'Failed to encode aggregate frontend state',
    }),
  );

  const encodedAuthentication = yield* Schema.encodeEffect(
    frontend.authentication.authenticationSchema,
  )(snapshot.authentication).pipe(
    mapParseError({
      code: 'frontend-authentication-invalid',
      prefix: 'Invalid frontend state authentication',
    }),
  );

  if (
    snapshot.aggregateId !== aggregateId ||
    !isEqual(encodedAuthentication, authentication) ||
    snapshot.aggregateName !== frontend.aggregateName ||
    snapshot.frontendName !== frontend.name ||
    snapshot.aggregateVersion !== frontend.aggregateVersion
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-state-target-mismatch',
      message: 'Aggregate frontend state does not match the bound target',
    });
  }

  if (
    new Set(snapshot.selectedCommands.map(command => command.id)).size !==
    snapshot.selectedCommands.length
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-snapshot-selected-command-duplicate',
      message: 'Aggregate frontend snapshot contains duplicate selected command IDs',
    });
  }

  for (const command of snapshot.selectedCommands) {
    if (
      command.selectionIndex > snapshot.selectionIndex ||
      command.aggregateIndex > snapshot.aggregateIndex
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-snapshot-selected-command-invalid',
        message:
          'Selected command exceeds the aggregate frontend snapshot position',
      });
    }
  }

  for (const resource of snapshot.resources) {
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

  yield* applyAggregateFrontendSnapshotTx({
    snapshot,
    sessionId,
    models,
  }).pipe(Effect.provideService(Db, db));
});
