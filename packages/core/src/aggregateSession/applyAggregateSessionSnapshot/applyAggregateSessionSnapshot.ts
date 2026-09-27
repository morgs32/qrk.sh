import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import type { IDrizzleRelationsFromModels } from '../../drizzle/types.ts';
import { getByKeyOrThrow } from '../../utils/getByKeyOrThrow.ts';
import { AggregateSessionSnapshotSchema } from '../AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import type {
  IAggregateSessionDefinition,
  IAggregateSessionSnapshot,
  ISessionDrizzleDb,
  ISessionId,
} from '../types.ts';

import { applyAggregateSessionSnapshotTx } from './applyAggregateSessionSnapshotTx/applyAggregateSessionSnapshotTx.ts';

export const applyAggregateSessionSnapshot = Effect.fn(
  'applyAggregateSessionSnapshot',
)(function* <DEFINITION extends IAggregateSessionDefinition>(props: {
  db: ISessionDrizzleDb<
    DEFINITION['models'],
    IDrizzleRelationsFromModels<DEFINITION['models']>
  >;
  definition: DEFINITION;
  sessionId: ISessionId;
  models: DEFINITION['models'];
  snapshot: IAggregateSessionSnapshot;
  aggregateId: IAggregateSessionSnapshot['aggregateId'];
  claims: IAggregateSessionSnapshot['claims'];
}): Effect.fn.Return<void, IAnyError> {
  const { aggregateId, db, definition, snapshot, models, sessionId, claims } =
    props;

  yield* Schema.encodeEffect(AggregateSessionSnapshotSchema)(snapshot, {
    onExcessProperty: 'error',
  }).pipe(
    mapParseError({
      code: 'aggregate-session-state-encode-failed',
      prefix: 'Failed to encode aggregate session state',
    }),
  );

  const encodedClaims = yield* Schema.encodeEffect(definition.claimsSchema)(
    snapshot.claims,
  ).pipe(
    mapParseError({
      code: 'session-claims-invalid',
      prefix: 'Invalid definition state claims',
    }),
  );

  if (
    snapshot.aggregateId !== aggregateId ||
    !isEqual(encodedClaims, claims) ||
    snapshot.aggregateName !== definition.aggregateName ||
    snapshot.actorName !== definition.actorName ||
    snapshot.actorVersion !== definition.actorVersion ||
    snapshot.sessionName !== definition.sessionName ||
    snapshot.aggregateVersion !== definition.aggregateVersion
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-session-state-target-mismatch',
        message: 'Aggregate definition state does not match the bound target',
      }),
    );
  }

  for (const resource of snapshot.resources) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: resource.modelName,
      recordKind: 'definition models',
    });
    yield* Schema.decodeUnknownEffect(makeEffectSchema(model.propertiesShape))(
      resource,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'aggregate-session-state-resource-invalid',
        prefix: `Failed to decode aggregate session state resource ${resource.modelName}.${resource.id}`,
      }),
    );
  }

  yield* applyAggregateSessionSnapshotTx(db, {
    snapshot,
    sessionId,
    models,
    definition,
  });
});
