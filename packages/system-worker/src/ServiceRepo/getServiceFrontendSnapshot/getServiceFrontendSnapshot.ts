import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type {
  IEncodedResourceShape,
  IServiceCursorId,
} from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, type IAnyError } from '@zerospin/error';
import { desc } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { serviceRepoDrizzleSchemas } from '../ServiceRepo.js';

/*
 * 1. Resolve the exact declared service-owned frontend projection.
 * 2. Capture the service watermark and every projected row in one transaction.
 * 3. Return a nullable baseline for a service that has not finalized a block.
 */
export const getServiceFrontendSnapshot = Effect.fn(
  'ServiceRepo.getServiceFrontendSnapshot',
)(function* (props: {
  serviceName: string;
  actorName: string;
  frontendName: string;
  db: IDb;
}): Effect.fn.Return<
  Readonly<{
    resources: readonly IEncodedResourceShape[];
    lastServiceCursor: IServiceCursorId | null;
    serviceIndex: number | null;
  }>,
  IAnyError
> {
  const { actorName, db, frontendName, serviceName } = props;

  // 1 — model membership comes from the trusted compiled controller graph.
  const serviceController = yield* getByKeyOrThrow({
    record: system.serviceControllers,
    key: serviceName,
    recordKind: 'service controllers',
  });
  const actorController = yield* getByKeyOrThrow({
    record: serviceController.actorControllers,
    key: actorName,
    recordKind: `actor controllers owned by service ${serviceName}`,
  });
  const frontendBinding = yield* getByKeyOrThrow({
    record: actorController.frontends,
    key: frontendName,
    recordKind: `frontends owned by service actor ${serviceName}.${actorName}`,
  });

  // 2 — no service block may split the resource snapshot from its source
  // watermark while this serialized repository transaction is open.
  return yield* makeTx({
    db,
    program: Effect.fn('ServiceRepo.getServiceFrontendSnapshot.transaction')(
      function* ({ tx }) {
        const watermark = tx
          .select()
          .from(serviceRepoDrizzleSchemas.serviceCursors)
          .orderBy(desc(serviceRepoDrizzleSchemas.serviceCursors.serviceIndex))
          .limit(1)
          .get();

        const resources: IEncodedResourceShape[] = [];
        for (const [modelName, model] of Object.entries(
          frontendBinding.frontendController.models,
        )) {
          if (model.modelName !== modelName) {
            continue;
          }
          for (const row of tx.select().from(model.drizzleSchema).all()) {
            resources.push(
              yield* Schema.validate(EncodedResourceSchema)(row).pipe(
                mapParseError({
                  code: 'service-frontend-snapshot-resource-invalid',
                  prefix: `Failed to decode service frontend resource ${serviceName}.${actorName}.${frontendName}.${modelName}`,
                }),
              ),
            );
          }
        }

        // 3 — an empty service has a real empty resource baseline and no
        // service cursor/index yet; the subscriber begins before the first row.
        return {
          resources,
          lastServiceCursor: watermark?.serviceCursor ?? null,
          serviceIndex: watermark?.serviceIndex ?? null,
        };
      },
    ),
  });
});
