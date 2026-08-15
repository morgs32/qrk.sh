import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { makeTx } from '../drizzle/makeTx.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type { IServiceFrontendController } from '../frontendController/types.ts';
import { makeEffectSchema } from '../models/primitiveMaps.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { ServiceFrontendStateSchema } from './ServiceFrontendBlockSchema.ts';
import type { IServiceFrontendState } from './types.ts';

/*
 * 1. Reject a state for any other system, user, service, or frontend.
 * 2. Prove every encoded resource belongs to one declared projection model.
 * 3. Replace all projected rows in one synchronous SQLite transaction.
 */
export const applyServiceFrontendState = Effect.fn('applyServiceFrontendState')(
  function* <FRONTEND extends IServiceFrontendController>(props: {
    frontend: FRONTEND;
    userId: IServiceFrontendState['userId'];
    systemId: IServiceFrontendState['systemId'];
    db: IDb<IResourceDbConfig<FRONTEND['models'], Record<never, never>>>;
    models: FRONTEND['models'];
    frontendState: IServiceFrontendState;
  }): Effect.fn.Return<void, IAnyError> {
    const { userId, db, frontend, frontendState, models, systemId } = props;

    yield* Schema.encode(ServiceFrontendStateSchema)(frontendState, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'service-frontend-state-encode-failed',
        prefix: 'Failed to encode service frontend state',
      }),
    );

    if (
      frontendState.userId !== userId ||
      frontendState.systemId !== systemId ||
      frontendState.serviceName !== frontend.serviceName ||
      frontendState.frontendName !== frontend.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-state-target-mismatch',
        message: 'Service frontend state does not match the bound target',
        extra: {
          expectedUserId: userId,
          expectedSystemId: systemId,
          expectedServiceName: frontend.serviceName,
          expectedFrontendName: frontend.frontendName,
          actualUserId: frontendState.userId,
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
      yield* Schema.decodeUnknown(makeEffectSchema(model.propertiesShape))(
        resource,
        { onExcessProperty: 'error' },
      ).pipe(
        mapParseError({
          code: 'service-frontend-state-resource-invalid',
          prefix: `Failed to decode service frontend state resource ${resource.modelName}.${resource.id}`,
        }),
      );
    }

    yield* makeTx({
      db,
      program: Effect.fn('applyServiceFrontendState.replaceResources')(
        function* ({ tx }) {
          yield* Effect.sync(() => {
            tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
          });

          for (const model of Object.values(models)) {
            tx.delete(model.drizzleSchema).run();
          }

          for (const resource of frontendState.resources) {
            const model = yield* getByKeyOrThrow({
              record: models,
              key: resource.modelName,
              recordKind: 'service frontend models',
            });
            tx.insert(model.drizzleSchema).values(resource).run();
          }
        },
      ),
    });
  },
);
