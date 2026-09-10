import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  ServiceExecutionEntrySchema,
  type ReplicatedResourceMutationSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type { IAnyMutation } from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { Model } from '@zerospin/core/models/makeModel';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { VersionedServiceChain } from '../../VersionedServiceChain/VersionedServiceChain.js';
import { VersionedServiceRepo } from '../../VersionedServiceRepo/VersionedServiceRepo.js';
import { versionedAggregateRepoDbConfig } from '../versionedAggregateRepoDbConfig.js';

/*
 * Read authoritative copies from each pinned service before the execution transaction.
 * The caller holds the execution permit, keeping committed source progress stable.
 * A newly enrolled resource behind that progress replays only its missing suffix.
 *
 * 1. Select replica mutations.
 * 2. Skip commands without replication work.
 * 3. Group resource references by source service.
 * 4. Read copies and their atomic source positions from pinned materializers.
 * 5. Reject missing source resources.
 * 6. Close any gap between a new copy and committed source progress.
 * 7. Return the effective replication mutations in original order.
 */
export const getReplicatedResources = Effect.fn(
  'VersionedAggregateRepo.getReplicatedResources',
)(function* (props: {
  systemId: string;
  db: IDb;
  mutations: readonly IAnyMutation[];
  services: Readonly<Record<string, string>>;
}): Effect.fn.Return<
  readonly Schema.Schema.Type<typeof ReplicatedResourceMutationSchema>[],
  IAnyError,
  Async
> {
  const { mutations, systemId } = props;

  // 1 — keep replicate operations whose model passes Model.isReplica
  const replicateMutations = mutations.filter(
    (
      mutation,
    ): mutation is Extract<IAnyMutation, { operationName: 'replicate' }> =>
      mutation.operationName === 'replicate' && Model.isReplica(mutation.model),
  );

  // 2 — return an empty mutation list
  if (replicateMutations.length === 0) {
    return [];
  }

  // 3 — sort by serviceName, modelName, and resourceId for deterministic requests
  const grouped = new Map<
    string,
    Array<{ modelName: string; resourceId: string }>
  >();
  for (const mutation of replicateMutations.toSorted((left, right) =>
    `${left.operation.serviceName}:${left.model.modelName}:${left.resourceId}`.localeCompare(
      `${right.operation.serviceName}:${right.model.modelName}:${right.resourceId}`,
    ),
  )) {
    const group = grouped.get(mutation.operation.serviceName) ?? [];
    group.push({
      modelName: mutation.model.modelName,
      resourceId: mutation.resourceId,
    });
    grouped.set(mutation.operation.serviceName, group);
  }

  // 4 — call getReplicatedResources once per service and index returned resources
  const found = new Map<
    string,
    Readonly<{
      modelName: string;
      resourceId: string;
      resource: unknown;
      serviceVersion: string;
      serviceIndex: number;
    }>
  >();
  for (const serviceName of [...grouped.keys()].toSorted()) {
    const refs = grouped.get(serviceName) ?? [];
    const serviceVersion = props.services[serviceName];
    if (serviceVersion === undefined) {
      return yield* new ZerospinError({
        code: 'replica-service-pin-missing',
        message: `Missing service version for ${serviceName}`,
      });
    }
    const versionedServiceRepo = yield* VersionedServiceRepo.getRepo({
      key: { systemId, serviceName, serviceVersion },
    });
    const snapshot = yield* makeAsync<
      IEncodedResult<
        Readonly<{
          resources: readonly (
            | Readonly<{
                status: 'found';
                modelName: string;
                resourceId: string;
                resource: unknown;
              }>
            | Readonly<{
                status: 'missing';
                modelName: string;
                resourceId: string;
                failure?: IAnyErrorJson;
              }>
          )[];
          serviceIndex: number;
        }>,
        IAnyErrorJson
      >,
      IAnyError
    >(
      () =>
        versionedServiceRepo.getReplicatedResources({
          resources: refs,
        }),
      ZerospinError.catch({
        code: 'aggregate-replication-snapshot-rpc-failed',
        message: `Failed to capture service ${serviceName}`,
      }),
    ).pipe(Effect.flatMap(decodeRpc));

    // 5 — propagate a supplied failure or report the missing service resource
    for (const resource of snapshot.resources) {
      if (resource.status === 'missing') {
        if (resource.failure !== undefined) {
          return yield* new ZerospinError(resource.failure);
        }
        return yield* new ZerospinError({
          code: 'aggregate-replicated-resource-missing',
          message: `Service resource ${serviceName}.${resource.modelName}.${resource.resourceId} was not found`,
        });
      }
      found.set(
        `${serviceName}\u0000${resource.modelName}\u0000${resource.resourceId}`,
        { ...resource, serviceVersion, serviceIndex: snapshot.serviceIndex },
      );
    }
  }

  // 6 — prepare each copy through the committed source cursor before enrollment
  const filled: Array<
    Schema.Schema.Type<typeof ReplicatedResourceMutationSchema>
  > = [];
  for (const mutation of replicateMutations) {
    const key = `${mutation.operation.serviceName}\u0000${mutation.model.modelName}\u0000${mutation.resourceId}`;
    const resource = found.get(key);
    if (resource === undefined) {
      return yield* new ZerospinError({
        code: 'aggregate-replicated-resource-missing',
        message: `Service resource ${mutation.operation.serviceName}.${mutation.model.modelName}.${mutation.resourceId} was not returned`,
      });
    }
    let snapshot = yield* Schema.decodeUnknownEffect(
      Schema.Record(Schema.String, Schema.Unknown),
    )(resource.resource).pipe(
      mapParseError({
        code: 'aggregate-replication-resource-invalid',
        prefix: 'Invalid replicated resource',
      }),
    );
    let serviceIndex = resource.serviceIndex;
    const tables = versionedAggregateRepoDbConfig.schema;
    const source = props.db
      .select()
      .from(tables.services)
      .where(eq(tables.services.serviceName, mutation.operation.serviceName))
      .get();
    const enrollment = props.db
      .select()
      .from(mutation.model.drizzleSchema)
      .where(eq(mutation.model.drizzleSchema.id, mutation.resourceId))
      .get();
    if (
      enrollment === undefined &&
      source !== undefined &&
      serviceIndex < source.lastIndex
    ) {
      const chain = yield* VersionedServiceChain.getRepo({
        key: {
          systemId,
          serviceName: mutation.operation.serviceName,
          serviceVersion: resource.serviceVersion,
        },
      });
      const queue = yield* makeAsync(() => chain.replicaFanoutQueue);
      while (serviceIndex < source.lastIndex) {
        const page = yield* makeAsync(() =>
          queue.getPage({
            afterIndex: serviceIndex,
            maxIndex: source.lastIndex,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (page.rows.length === 0) {
          return yield* new ZerospinError({
            code: 'replica-history-missing',
            message:
              'Initial replica copy cannot reach committed source progress',
          });
        }
        for (const row of page.rows) {
          const entry = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(ServiceExecutionEntrySchema),
          )(row.entry).pipe(
            mapParseError({
              code: 'replica-source-entry-invalid',
              prefix: 'Invalid retained service input',
            }),
          );
          if (
            row.outboxIndex !== serviceIndex + 1 ||
            row.outboxIndex > source.lastIndex ||
            row.executionVersion !== resource.serviceVersion ||
            entry.preparationVersion !== resource.serviceVersion ||
            entry.command.serviceName !== mutation.operation.serviceName ||
            entry.command.serviceIndex !== row.outboxIndex ||
            entry.command.dispositionHash === null
          ) {
            return yield* new ZerospinError({
              code: 'replica-source-entry-invalid',
              message:
                'Retained suffix does not match the initial replica source',
            });
          }
          if (entry.command.delta !== null) {
            for (const change of [
              ...entry.command.delta.inserted,
              ...entry.command.delta.updated,
              ...entry.command.delta.deleted,
            ]) {
              if (
                change.modelName === mutation.model.modelName &&
                change.id === mutation.resourceId
              ) {
                snapshot = change;
              }
            }
          }
          serviceIndex = row.outboxIndex;
        }
      }
    }
    if (typeof snapshot.version !== 'string') {
      return yield* new ZerospinError({
        code: 'service-resource-version-missing',
        message: 'Service snapshot must contain its model version',
      });
    }
    filled.push({
      modelName: mutation.model.modelName,
      modelVersion: snapshot.version,
      operationName: 'replicate',
      resourceId: mutation.resourceId,
      operation: {
        serviceName: mutation.operation.serviceName,
        serviceVersion: resource.serviceVersion,
        serviceIndex,
        resource: {
          ...snapshot,
          deletedAt: snapshot.deletedAt ?? null,
          serviceIndex,
        },
      },
    });
  }

  // 7 — preserve original mutation order and effective source positions
  return filled;
});
