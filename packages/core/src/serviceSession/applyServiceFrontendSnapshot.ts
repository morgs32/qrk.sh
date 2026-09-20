import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import type { IServiceFrontendController } from '../frontendController/types.ts';
import type { ISessionId } from '../session/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import {
  applyServiceFrontendSnapshotTx,
  Db,
} from './applyServiceFrontendSnapshotTx.ts';
import { ServiceFrontendSnapshotSchema } from './ServiceSelectedCommandSchema.ts';
import type {
  IServiceFrontendSnapshot,
  IServiceSessionDrizzleDb,
} from './types.ts';

/*
 * 1. Reject a snapshot for any other user, service, or frontend.
 * 2. Prove every encoded resource belongs to one declared projection model.
 * 3. Replace all projected rows in one synchronous SQLite transaction.
 */
export const applyServiceFrontendSnapshot = Effect.fn('applyServiceFrontendSnapshot')(
  function* <FRONTEND extends IServiceFrontendController>(props: {
    frontend: FRONTEND;
    sessionId: ISessionId;
    authentication: IServiceFrontendSnapshot['authentication'];
    db: IServiceSessionDrizzleDb<FRONTEND['models'], Record<never, never>>;
    models: FRONTEND['models'];
    snapshot: IServiceFrontendSnapshot;
  }): Effect.fn.Return<void, IAnyError> {
    const {
      db,
      frontend,
      snapshot,
      models,
      sessionId,
      authentication,
    } = props;

    yield* Schema.encodeEffect(ServiceFrontendSnapshotSchema)(snapshot, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'service-frontend-state-encode-failed',
        prefix: 'Failed to encode service frontend state',
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
      !isEqual(encodedAuthentication, authentication) ||
      snapshot.serviceName !== frontend.serviceName ||
      snapshot.frontendName !== frontend.name
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-state-target-mismatch',
        message: 'Service frontend state does not match the bound target',
        extra: {
          expectedIdentityKey: authentication,
          expectedServiceName: frontend.serviceName,
          expectedFrontendName: frontend.name,
          actualIdentityKey: snapshot.authentication,
          actualServiceName: snapshot.serviceName,
          actualFrontendName: snapshot.frontendName,
        },
      });
    }

    // Validate the complete snapshot before the transaction deletes one row.
    for (const resource of snapshot.resources) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: resource.modelName,
        recordKind: 'service frontend models',
      });
      yield* Schema.decodeUnknownEffect(
        makeEffectSchema(model.propertiesShape),
      )(resource, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'service-frontend-state-resource-invalid',
          prefix: `Failed to decode service frontend state resource ${resource.modelName}.${resource.id}`,
        }),
      );
    }

    yield* applyServiceFrontendSnapshotTx({
      models,
      snapshot,
      sessionId,
    }).pipe(Effect.provideService(Db, db));
  },
);
