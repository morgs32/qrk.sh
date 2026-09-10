import type { IDb } from '@zerospin/core/drizzle/types';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError, type IAnyErrorJson } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { versionedServiceRepoDbConfig } from '../versionedServiceRepoDbConfig.js';

/*
 * Aggregate preparation reads authoritative service resources through this
 * owner-local snapshot operation. Missing rows are represented individually
 * with encoded failures alongside the local service frontier.
 *
 * 1. Resolve the owning service.
 * 2. Collect one result per requested reference.
 * 3. Read each resource from its owned model table.
 * 4. Represent missing and found resources explicitly.
 * 5. Return the local materialization frontier.
 */
export const getReplicatedResources = Effect.fn(
  'VersionedServiceRepo.getReplicatedResources',
)(function* (props: {
  serviceName: string;
  serviceVersion: string;
  resources: readonly Readonly<{ modelName: string; resourceId: string }>[];
  db: IDb;
}) {
  const { db, resources: requestedResources, serviceName } = props;

  // 1 — use serviceName to select the authored model registry
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

  // 2 — preserve request order for found and missing resources
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

  // 3 — resolve modelName and query resourceId
  for (const resourceRef of requestedResources) {
    const model = yield* getByKeyOrThrow({
      record: service.models,
      key: resourceRef.modelName,
      recordKind: `models owned by service ${serviceName}`,
    });
    const resource = db
      .select()
      .from(model.drizzleSchema)
      .where(eq(model.drizzleSchema.id, resourceRef.resourceId))
      .get();

    // 4 — encode replicated-service-resource-not-found for a missing row
    if (resource === undefined) {
      resources.push({
        status: 'missing',
        modelName: resourceRef.modelName,
        resourceId: resourceRef.resourceId,
        failure: Schema.encodeSync(ZerospinError.schema)(
          new ZerospinError({
            code: 'replicated-service-resource-not-found',
            message: `Service resource ${serviceName}.${resourceRef.modelName}.${resourceRef.resourceId} was not found`,
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

  // 5 — include resources with materializationState.serviceIndex or zero
  const serviceIndex =
    db
      .select()
      .from(versionedServiceRepoDbConfig.schema.head)
      .where(eq(versionedServiceRepoDbConfig.schema.head.singletonId, 1))
      .get()?.serviceIndex ?? 0;
  return { resources, serviceIndex };
});
