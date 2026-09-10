import type { IDb } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { versionedServiceRepoDbConfig } from '../versionedServiceRepoDbConfig.js';

/*
 * Service frontend initialization reads owner resources and their local
 * service frontier here. This verifies the frontend binding but returns the
 * service resource snapshot for downstream projection.
 *
 * 1. Resolve the service definition.
 * 2. Check the frontend belongs to the service.
 * 3. Collect all service model rows.
 * 4. Read the local snapshot frontier.
 * 5. Return resources with their service cursor.
 */
export const getServiceFrontendSnapshot = Effect.fn(
  'VersionedServiceRepo.getServiceFrontendSnapshot',
)(function* (props: {
  serviceName: string;
  serviceVersion: string;
  frontendName: string;
  db: IDb;
}) {
  const { db, frontendName, serviceName } = props;

  // 1 — read system.services by serviceName
  const latestService = yield* getByKeyOrThrow({
    record: system.services,
    key: serviceName,
    recordKind: 'services',
  });
  const service = yield* getByKeyOrThrow({
    record: latestService,
    key: props.serviceVersion,
    recordKind: 'listed versions',
  });

  // 2 — require the requested service.frontends binding
  yield* getByKeyOrThrow({
    record: service.frontends,
    key: frontendName,
    recordKind: `frontends owned by service ${serviceName}`,
  });

  // 3 — validate each persisted row as EncodedResourceSchema
  const resources: IEncodedResourceShape[] = [];
  for (const model of Object.values(service.models)) {
    for (const row of db.select().from(model.drizzleSchema).all()) {
      resources.push(
        yield* Schema.decodeEffect(Schema.toType(EncodedResourceSchema))(
          row,
        ).pipe(
          mapParseError({
            code: 'service-frontend-snapshot-resource-invalid',
            prefix: `Failed to decode ${serviceName}.${model.modelName}`,
          }),
        ),
      );
    }
  }

  // 4 — use materializationState.serviceIndex or zero
  const serviceIndex =
    db
      .select()
      .from(versionedServiceRepoDbConfig.schema.head)
      .where(eq(versionedServiceRepoDbConfig.schema.head.singletonId, 1))
      .get()?.serviceIndex ?? 0;

  // 5 — let the frontend materializer project the owner snapshot
  return { resources, serviceIndex };
});
