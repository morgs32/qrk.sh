import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import type { IServiceFrontendController } from '../frontendController/types.ts';
import type { ISessionId } from '../session/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import {
  applyServiceFrontendStateTx,
  Db,
} from './applyServiceFrontendStateTx.ts';
import { ServiceFrontendStateSchema } from './ServiceFrontendCommandSchema.ts';
import type {
  IServiceFrontendState,
  IServiceSessionDrizzleDb,
} from './types.ts';

/*
 * 1. Reject a state for any other system, user, service, or frontend.
 * 2. Prove every encoded resource belongs to one declared projection model.
 * 3. Replace all projected rows in one synchronous SQLite transaction.
 */
export const applyServiceFrontendState = Effect.fn('applyServiceFrontendState')(
  function* <FRONTEND extends IServiceFrontendController>(props: {
    frontend: FRONTEND;
    sessionId: ISessionId;
    authentication: IServiceFrontendState['authentication'];
    systemId: IServiceFrontendState['systemId'];
    db: IServiceSessionDrizzleDb<FRONTEND['models'], Record<never, never>>;
    models: FRONTEND['models'];
    frontendState: IServiceFrontendState;
  }): Effect.fn.Return<void, IAnyError> {
    const {
      db,
      frontend,
      frontendState,
      models,
      sessionId,
      systemId,
      authentication,
    } = props;

    yield* Schema.encodeEffect(ServiceFrontendStateSchema)(frontendState, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'service-frontend-state-encode-failed',
        prefix: 'Failed to encode service frontend state',
      }),
    );

    if (
      !isEqual(frontendState.authentication, authentication) ||
      frontendState.systemId !== systemId ||
      frontendState.serviceName !== frontend.serviceName ||
      frontendState.frontendName !== frontend.name
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-state-target-mismatch',
        message: 'Service frontend state does not match the bound target',
        extra: {
          expectedIdentityKey: authentication,
          expectedSystemId: systemId,
          expectedServiceName: frontend.serviceName,
          expectedFrontendName: frontend.name,
          actualIdentityKey: frontendState.authentication,
          actualSystemId: frontendState.systemId,
          actualServiceName: frontendState.serviceName,
          actualFrontendName: frontendState.frontendName,
        },
      });
    }

    // Validate the complete snapshot before the transaction deletes one row.
    for (const resource of frontendState.resources) {
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

    yield* applyServiceFrontendStateTx({
      models,
      frontendState,
      sessionId,
    }).pipe(Effect.provideService(Db, db));
  },
);
