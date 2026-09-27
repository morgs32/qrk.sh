import type { IDb } from '@zerospin/core/drizzle/types';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  encodeError,
  makeZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { serviceVersionRepoDbConfig } from '../serviceVersionRepoDbConfig.js';

const { system } = config;

/*
 * Aggregate preparation reads authoritative service resources through this
 * owner-local snapshot operation. Missing rows are represented individually
 * with encoded failures alongside the local service frontier.
 *
 * 1. Resolve the owning service.
 * 2. Resolve every requested model before reading database state.
 * 3. Capture resources and frontier without yielding between database reads.
 * 4. Represent missing and found resources explicitly.
 * 5. Return the local materialization frontier.
 */
export const getReplicatedResources = Effect.fn(
  'ServiceVersionRepo.getReplicatedResources',
)(function* (props: {
  serviceName: string;
  serviceVersion: string;
  resources: readonly Readonly<{ modelName: string; resourceId: string }>[];
  db: IDb;
}) {
  const {
    db,
    resources: requestedResources,
    serviceName,
    serviceVersion,
  } = props;

  // 1 — use serviceName to select the authored model registry
  const latestService = yield* getByKeyOrThrow({
    record: system.services,
    key: serviceName,
    recordKind: 'services',
  });
  const service = yield* getByKeyOrThrow({
    record: latestService,
    key: serviceVersion,
    recordKind: 'listed versions',
  });

  // 2 — finish effectful lookups before the synchronous snapshot capture
  const requested = yield* Effect.forEach(requestedResources, resourceRef =>
    getByKeyOrThrow({
      record: service.models,
      key: resourceRef.modelName,
      recordKind: `models owned by service ${serviceName}`,
    }).pipe(Effect.map(model => ({ ...resourceRef, model }))),
  );

  // 3 — preserve request order and do not yield until the frontier is captured
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
        failure: IZerospinErrorJson;
      }>
  > = [];

  for (const resourceRef of requested) {
    const { model } = resourceRef;
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
        failure: yield* encodeError(
          makeZerospinError({
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

  // 5 — include resources with head.serviceIndex or zero
  const serviceIndex =
    db
      .select()
      .from(serviceVersionRepoDbConfig.schema.head)
      .where(eq(serviceVersionRepoDbConfig.schema.head.singletonId, 1))
      .get()?.serviceIndex ?? 0;
  return { resources, serviceIndex };
});
