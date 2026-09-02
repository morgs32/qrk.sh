import type { IDb } from '@zerospin/core/drizzle/types';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { materializedServiceRepoDrizzleSchemas } from '../MaterializedServiceRepoDbConfig.js';

export const getReplicatedResources = Effect.fn(
  'MaterializedServiceRepo.getReplicatedResources',
)(function* (props: {
  serviceName: string;
  resources: readonly Readonly<{ modelName: string; resourceId: string }>[];
  db: IDb;
}) {
  const service = yield* getByKeyOrThrow({
    record: system.services,
    key: props.serviceName,
    recordKind: 'services',
  });
  const resources: Array<
    | Readonly<{
        status: 'found';
        modelName: string;
        resourceId: string;
        resource: IEncodedResourceShape;
      }>
    | Readonly<{
        status: 'missing';
        modelName: string;
        resourceId: string;
        failure: IAnyErrorJson;
      }>
  > = [];
  for (const resourceRef of props.resources) {
    const model = yield* getByKeyOrThrow({
      record: service.models,
      key: resourceRef.modelName,
      recordKind: `models owned by service ${props.serviceName}`,
    });
    const resource = props.db
      .select()
      .from(model.drizzleSchema)
      .where(eq(model.drizzleSchema.id, resourceRef.resourceId))
      .get();
    if (resource === undefined) {
      resources.push({
        status: 'missing',
        modelName: resourceRef.modelName,
        resourceId: resourceRef.resourceId,
        failure: Schema.encodeSync(ZerospinError.schema)(
          new ZerospinError({
            code: 'replicated-service-resource-not-found',
            message: `Service resource ${props.serviceName}.${resourceRef.modelName}.${resourceRef.resourceId} was not found`,
          }),
        ),
      });
    } else {
      resources.push({
        status: 'found',
        modelName: resourceRef.modelName,
        resourceId: resourceRef.resourceId,
        resource,
      });
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
