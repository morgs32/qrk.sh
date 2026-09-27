import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import type { ISessionId } from '../../aggregateSession/types.ts';
import { getByKeyOrThrow } from '../../utils/getByKeyOrThrow.ts';
import { ServiceSessionSnapshotSchema } from '../ServiceActorCommandSchema.ts';
import type {
  IServiceSessionDefinition,
  IServiceSessionDrizzleDb,
  IServiceSessionSnapshot,
} from '../types.ts';

import { applyServiceSessionSnapshotTx } from './applyServiceSessionSnapshotTx/applyServiceSessionSnapshotTx.ts';

/*
 * 1. Reject a snapshot for any other user, service, or definition.
 * 2. Prove every encoded resource belongs to one declared projection model.
 * 3. Replace all projected rows in one synchronous SQLite transaction.
 */
export const applyServiceSessionSnapshot = Effect.fn(
  'applyServiceSessionSnapshot',
)(function* <DEFINITION extends IServiceSessionDefinition>(props: {
  definition: DEFINITION;
  sessionId: ISessionId;
  identity: IServiceSessionSnapshot['identity'];
  db: IServiceSessionDrizzleDb<DEFINITION['models'], Record<never, never>>;
  models: DEFINITION['models'];
  snapshot: IServiceSessionSnapshot;
}): Effect.fn.Return<void, IAnyError> {
  const { db, definition, snapshot, models, sessionId, identity } = props;

  yield* Schema.encodeEffect(ServiceSessionSnapshotSchema)(snapshot, {
    onExcessProperty: 'error',
  }).pipe(
    mapParseError({
      code: 'service-session-state-encode-failed',
      prefix: 'Failed to encode service session state',
    }),
  );

  const encodedIdentity = yield* Schema.encodeEffect(
    definition.identity.identitySchema,
  )(snapshot.identity).pipe(
    mapParseError({
      code: 'session-identity-invalid',
      prefix: 'Invalid definition state identity',
    }),
  );

  if (
    !isEqual(encodedIdentity, identity) ||
    snapshot.actorName !== definition.actorName ||
    snapshot.actorVersion !== definition.actorVersion ||
    snapshot.serviceVersion !== definition.serviceVersion ||
    snapshot.serviceName !== definition.serviceName ||
    snapshot.sessionName !== definition.sessionName
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-session-state-target-mismatch',
        message: 'Service definition state does not match the bound target',
        extra: {
          expectedIdentityKey: identity,
          expectedServiceName: definition.serviceName,
          expectedSessionName: definition.sessionName,
          actualIdentityKey: snapshot.identity,
          actualServiceName: snapshot.serviceName,
          actualSessionName: snapshot.sessionName,
        },
      }),
    );
  }

  // Validate the complete snapshot before the transaction deletes one row.
  for (const resource of snapshot.resources) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: resource.modelName,
      recordKind: 'service definition models',
    });
    yield* Schema.decodeUnknownEffect(makeEffectSchema(model.propertiesShape))(
      resource,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'service-session-state-resource-invalid',
        prefix: `Failed to decode service session state resource ${resource.modelName}.${resource.id}`,
      }),
    );
  }

  yield* applyServiceSessionSnapshotTx(db, {
    models,
    snapshot,
    sessionId,
  });
});
