import type { IDb } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { materializedServiceRepoDrizzleSchemas } from '../MaterializedServiceRepoDbConfig.js';

export const getServiceFrontendSnapshot = Effect.fn(
  'MaterializedServiceRepo.getServiceFrontendSnapshot',
)(function* (props: { serviceName: string; frontendName: string; db: IDb }) {
  const service = yield* getByKeyOrThrow({
    record: system.services,
    key: props.serviceName,
    recordKind: 'services',
  });
  yield* getByKeyOrThrow({
    record: service.frontends,
    key: props.frontendName,
    recordKind: `frontends owned by service ${props.serviceName}`,
  });
  const resources: IEncodedResourceShape[] = [];
  for (const model of Object.values(service.models)) {
    for (const row of props.db.select().from(model.drizzleSchema).all()) {
      resources.push(
        yield* Schema.decodeEffect(Schema.toType(EncodedResourceSchema))(
          row,
        ).pipe(
          mapParseError({
            code: 'service-frontend-snapshot-resource-invalid',
            prefix: `Failed to decode ${props.serviceName}.${model.modelName}`,
          }),
        ),
      );
    }
  }
  const serviceIndex =
    props.db
      .select()
      .from(materializedServiceRepoDrizzleSchemas.materializationState)
      .where(
        eq(materializedServiceRepoDrizzleSchemas.materializationState.id, 1),
      )
      .get()?.serviceIndex ?? 0;
  return { resources, serviceIndex };
});
