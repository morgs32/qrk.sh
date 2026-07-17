import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import type {
  IEncodedResourceShape,
  IServiceCursorId,
} from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { and, asc, desc, eq, gt, lte } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { ServiceBlockSchema } from '../../blockSchemas.js';
import type { IServiceBlock } from '../../types.js';
import { serviceRepoDrizzleSchemas } from '../ServiceRepo.js';

/*
 * 1. Resolve the service controller from the Durable Object key.
 * 2. Open one transaction for the watermark, resources, and retained blocks.
 * 3. Capture the latest service watermark W.
 * 4. Read every requested resource in request order.
 * 5. Read and decode the retained ServiceBlock suffix in (C, W].
 * 6. Return one coherent grouped snapshot tied to W.
 */
export const getReplicatedResources = Effect.fn(
  'ServiceRepo.getReplicatedResources',
)(function* (props: {
  serviceName: string;
  currentServiceIndex: number | null;
  resources: readonly Readonly<{
    modelName: string;
    resourceId: string;
  }>[];
  db: IDb;
}): Effect.fn.Return<
  Readonly<{
    resources: readonly (
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
    )[];
    serviceBlocks: readonly IServiceBlock[];
    lastServiceCursor: IServiceCursorId;
    serviceIndex: number;
  }>,
  IAnyError
> {
  const { currentServiceIndex, db, resources, serviceName } = props;

  // 1 — the Durable Object key is the only service identity accepted by this snapshot
  const serviceController = yield* getByKeyOrThrow({
    record: system.serviceControllers,
    key: serviceName,
    recordKind: 'service controllers',
  });

  // 2 — resource rows, watermark W, and (C, W] must come from one SQLite view
  return yield* makeTx({
    db,
    program: Effect.fn('ServiceRepo.getReplicatedResources.transaction')(
      function* ({ tx }) {
        // 3 — capture W before interpreting any resource as the canonical snapshot
        const watermark = tx
          .select()
          .from(serviceRepoDrizzleSchemas.serviceCursors)
          .orderBy(
            desc(serviceRepoDrizzleSchemas.serviceCursors.serviceIndex),
          )
          .limit(1)
          .get();
        if (watermark === undefined) {
          return yield* new ZerospinError({
            code: 'service-resource-watermark-not-found',
            message: `Service ${serviceName} has no service watermark`,
          });
        }

        // 4 — preserve positional correspondence, including duplicate refs and missing rows
        const resourceResults: Array<
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
        for (const resourceRef of resources) {
          const model = yield* getByKeyOrThrow({
            record: serviceController.models,
            key: resourceRef.modelName,
            recordKind: `models owned by service ${serviceName}`,
          });
          if (
            !('serviceName' in model) ||
            model.serviceName !== serviceName
          ) {
            return yield* new ZerospinError({
              code: 'replication-service-model-mismatch',
              message: `Replication model "${resourceRef.modelName}" is not owned by service "${serviceName}"`,
            });
          }
          const resource = tx
            .select()
            .from(model.drizzleSchema)
            .where(eq(model.drizzleSchema.id, resourceRef.resourceId))
            .get();
          if (resource === undefined) {
            resourceResults.push({
              status: 'missing',
              modelName: resourceRef.modelName,
              resourceId: resourceRef.resourceId,
              failure: Schema.encodeSync(ZerospinError.schema)(
                new ZerospinError({
                  code: 'replicated-service-resource-not-found',
                  message: `Service resource ${serviceName}.${resourceRef.modelName}.${resourceRef.resourceId} was not found`,
                  extra: {
                    serviceName,
                    modelName: resourceRef.modelName,
                    resourceId: resourceRef.resourceId,
                  },
                }),
              ),
            });
            continue;
          }
          resourceResults.push({
            status: 'found',
            modelName: resourceRef.modelName,
            resourceId: resourceRef.resourceId,
            resource,
          });
        }

        // 5 — ServiceRepo returns (C, W] because a waiting ServiceBlockRepo delivery cannot be consumed inside this snapshot transaction
        const serviceBlocks: IServiceBlock[] = [];
        if (currentServiceIndex !== null) {
          const rows = tx
            .select()
            .from(serviceRepoDrizzleSchemas.serviceBlockOutbox)
            .where(
              and(
                gt(
                  serviceRepoDrizzleSchemas.serviceBlockOutbox.serviceIndex,
                  currentServiceIndex,
                ),
                lte(
                  serviceRepoDrizzleSchemas.serviceBlockOutbox.serviceIndex,
                  watermark.serviceIndex,
                ),
              ),
            )
            .orderBy(
              asc(serviceRepoDrizzleSchemas.serviceBlockOutbox.serviceIndex),
            )
            .all();
          for (const row of rows) {
            serviceBlocks.push(
              yield* Schema.decodeUnknown(Schema.parseJson(ServiceBlockSchema))(
                row.block,
              ).pipe(
                mapParseError({
                  code: 'service-block-outbox-decode-failed',
                  prefix: 'Failed to decode service block outbox row',
                }),
              ),
            );
          }
        }

        // 6 — every found resource and retained block is explicitly tied to the same W
        return {
          resources: resourceResults,
          serviceBlocks,
          lastServiceCursor: watermark.serviceCursor,
          serviceIndex: watermark.serviceIndex,
        };
      },
    ),
  });
});
