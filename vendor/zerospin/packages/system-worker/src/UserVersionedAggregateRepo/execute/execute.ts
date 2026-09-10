import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  AggregateExecutionEntrySchema,
  ServiceExecutionEntrySchema,
} from '@zerospin/core/contracts/CommandSchema';
import { prepareReplayAppliedMutation } from '@zerospin/core/contracts/prepareReplayAppliedMutation';
import type { IAnyMutation } from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { Model } from '@zerospin/core/models/makeModel';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { type versionedAggregateChainDbConfig } from '../../VersionedAggregateChain/versionedAggregateChainDbConfig.js';
import { VersionedServiceChain } from '../../VersionedServiceChain/VersionedServiceChain.js';
import type { versionedServiceChainDbConfig } from '../../VersionedServiceChain/versionedServiceChainDbConfig.js';
import {
  UserVersionedAggregateRepoDb,
  userVersionedAggregateRepoDbConfig,
} from '../userVersionedAggregateRepoDbConfig.js';

import { executeTx } from './executeTx.js';

/** Replay independent aggregate and pinned service inputs into one ordered frontend stream. */
/*
 * VAC delivery installs successful aggregate mutations and initial replica
 * copies. Direct VSC delivery updates enrolled replicas. Neither path runs
 * authored programs or guards; each consumed occurrence commits one frontend
 * position while only VAC inputs advance aggregate progress.
 *
 * 1. Resolve the authored aggregate.
 * 2. Load the preceding projection in the transaction.
 * 3. Enforce each source's contiguous replay and retry identity.
 * 4. Validate the terminal occurrence against its bound owner.
 * 5. Apply successful changes without regressing enrolled replica copies.
 * 6. Select this user graph from the complete aggregate model set.
 * 7. Compare membership and values with the preceding graph.
 * 8. Encode one output and its own-origin resolution.
 * 9. Commit output and the new projection checkpoint.
 */
export const execute = Effect.fn('UserVersionedAggregateRepo.execute')(
  function* (props: {
    rows: readonly (
      | typeof versionedAggregateChainDbConfig.schema.commands.$inferSelect
      | typeof versionedServiceChainDbConfig.schema.commands.$inferSelect
    )[];
    source?: { serviceName: string; serviceVersion: string };
    db: IDb;
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
      userId: string;
    };
  }): Effect.fn.Return<void, IAnyError, Async> {
    const { rows, db, key } = props;

    // 1 — retain the owner used to select each entry executionVersion
    const latestAggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });
    const aggregate = yield* getByKeyOrThrow({
      record: latestAggregate,
      key: key.aggregateVersion,
      recordKind: 'listed versions',
    });
    const inputs: Array<{
      row: (typeof rows)[number];
      aggregateEntry: Schema.Schema.Type<
        typeof AggregateExecutionEntrySchema
      > | null;
      serviceEntry: Schema.Schema.Type<
        typeof ServiceExecutionEntrySchema
      > | null;
      mutations: IAnyMutation[];
    }> = [];
    const sourceCursors = new Map(
      db
        .select()
        .from(userVersionedAggregateRepoDbConfig.schema.services)
        .all()
        .map(source => [source.serviceName, source.lastIndex]),
    );
    // Prepare late enrollments against a bounded retained source suffix before opening the transaction.
    // The caller holds the execution permit, so sourceCursors remain stable during these reads.
    for (const row of rows) {
      const aggregateEntry =
        props.source !== undefined
          ? null
          : yield* Schema.decodeUnknownEffect(
              Schema.fromJsonString(AggregateExecutionEntrySchema),
            )(row.entry).pipe(
              mapParseError({
                code: 'replica-command-invalid',
                prefix: 'Invalid aggregate replay input',
              }),
            );
      const serviceEntry =
        props.source !== undefined
          ? yield* Schema.decodeUnknownEffect(
              Schema.fromJsonString(ServiceExecutionEntrySchema),
            )(row.entry).pipe(
              mapParseError({
                code: 'replica-command-invalid',
                prefix: 'Invalid service replay input',
              }),
            )
          : null;
      const mutations: IAnyMutation[] = [];
      if (aggregateEntry !== null && aggregateEntry.command.failedAt === null) {
        for (const mutation of aggregateEntry.mutations) {
          let prepared = yield* prepareReplayAppliedMutation({
            mutation,
            controller: aggregate,
          });
          if (prepared === null) continue;
          if (prepared.operationName === 'replicate') {
            const source = yield* Schema.decodeUnknownEffect(
              Schema.fromJsonString(
                Schema.Struct({
                  serviceName: Schema.String,
                  serviceVersion: Schema.String,
                  serviceIndex: Schema.Number,
                }),
              ),
            )(mutation.operation).pipe(
              mapParseError({
                code: 'replica-source-metadata-invalid',
                prefix:
                  'Captured replica mutation requires source version and position',
              }),
            );
            if (
              !Number.isInteger(source.serviceIndex) ||
              source.serviceIndex < 0 ||
              aggregate.services[source.serviceName] !== source.serviceVersion
            ) {
              return yield* new ZerospinError({
                code: 'replica-source-target-mismatch',
                message:
                  'Captured replica mutation does not match a pinned service source',
              });
            }
            const through =
              sourceCursors.get(source.serviceName) ?? source.serviceIndex;
            const enrollment = db
              .select()
              .from(prepared.model.drizzleSchema)
              .where(eq(prepared.model.drizzleSchema.id, prepared.resourceId))
              .get();
            if (enrollment === undefined && source.serviceIndex < through) {
              const chain = yield* VersionedServiceChain.getRepo({
                key: {
                  systemId: key.systemId,
                  serviceName: source.serviceName,
                  serviceVersion: source.serviceVersion,
                },
              });
              const queue = yield* makeAsync(() => chain.replicaFanoutQueue);
              let after = source.serviceIndex;
              while (after < through) {
                const page = yield* makeAsync(() =>
                  queue.getPage({
                    afterIndex: after,
                    maxIndex: through,
                  }),
                ).pipe(Effect.flatMap(decodeRpc));
                if (page.rows.length === 0) {
                  return yield* new ZerospinError({
                    code: 'replica-history-missing',
                    message: 'Captured resource catch-up has a gap',
                  });
                }
                for (const sourceRow of page.rows) {
                  const retained = yield* Schema.decodeUnknownEffect(
                    Schema.fromJsonString(ServiceExecutionEntrySchema),
                  )(sourceRow.entry).pipe(
                    mapParseError({
                      code: 'replica-source-entry-invalid',
                      prefix: 'Invalid retained service input',
                    }),
                  );
                  if (
                    sourceRow.outboxIndex !== after + 1 ||
                    sourceRow.outboxIndex > through ||
                    sourceRow.executionVersion !== source.serviceVersion ||
                    retained.command.serviceName !== source.serviceName ||
                    retained.command.serviceIndex !== sourceRow.outboxIndex ||
                    retained.preparationVersion !== source.serviceVersion ||
                    retained.command.dispositionHash === null
                  ) {
                    return yield* new ZerospinError({
                      code: 'replica-source-entry-invalid',
                      message:
                        'Retained service suffix does not match the captured resource source',
                    });
                  }
                  if (
                    retained.command.failedAt === null &&
                    retained.command.delta !== null
                  ) {
                    for (const resource of [
                      ...retained.command.delta.inserted,
                      ...retained.command.delta.updated,
                      ...retained.command.delta.deleted,
                    ]) {
                      if (
                        resource.modelName !== mutation.modelName ||
                        resource.id !== mutation.resourceId
                      ) {
                        continue;
                      }
                      const newer = yield* prepareReplayAppliedMutation({
                        controller: aggregate,
                        mutation: {
                          modelName: resource.modelName,
                          modelVersion: resource.version,
                          resourceId: resource.id,
                          operationName: 'replicate',
                          operation: JSON.stringify({
                            serviceName: source.serviceName,
                            serviceVersion: source.serviceVersion,
                            serviceIndex: sourceRow.outboxIndex,
                            resource: {
                              ...resource,
                              deletedAt: resource.deletedAt ?? null,
                              serviceIndex: sourceRow.outboxIndex,
                            },
                          }),
                        },
                      });
                      if (newer !== null) prepared = newer;
                    }
                  }
                  after = sourceRow.outboxIndex;
                }
              }
            }
            if (prepared.operationName !== 'replicate') {
              return yield* new ZerospinError({
                code: 'replica-source-mutation-invalid',
                message:
                  'Service replication must produce a replica resource mutation',
              });
            }
            prepared = {
              ...prepared,
              operation: {
                ...prepared.operation,
                ...source,
                serviceIndex: Math.max(source.serviceIndex, through),
                resource: {
                  ...prepared.operation.resource,
                  serviceIndex: Math.max(source.serviceIndex, through),
                },
              },
            };
          }
          mutations.push(prepared);
        }
      }
      if (serviceEntry !== null) {
        const command = serviceEntry.command;
        if (
          row.executionVersion !== aggregate.services[command.serviceName] ||
          serviceEntry.preparationVersion !== row.executionVersion ||
          command.serviceIndex !== row.outboxIndex ||
          command.dispositionHash === null
        ) {
          return yield* new ZerospinError({
            code: 'replica-source-target-mismatch',
            message: 'Service replay input does not match a pinned source',
          });
        }
        if (
          command.failedAt === null &&
          command.delta !== null &&
          row.outboxIndex > (sourceCursors.get(command.serviceName) ?? 0)
        ) {
          for (const resource of [
            ...command.delta.inserted,
            ...command.delta.updated,
            ...command.delta.deleted,
          ]) {
            const model = aggregate.models[resource.modelName];
            if (
              !model ||
              !Model.isReplica(model) ||
              model.serviceName !== command.serviceName
            ) {
              continue;
            }
            const prepared = yield* prepareReplayAppliedMutation({
              controller: aggregate,
              mutation: {
                modelName: resource.modelName,
                modelVersion: resource.version,
                resourceId: resource.id,
                operationName: 'replicate',
                operation: JSON.stringify({
                  serviceName: command.serviceName,
                  serviceVersion: row.executionVersion,
                  serviceIndex: row.outboxIndex,
                  resource: {
                    ...resource,
                    deletedAt: resource.deletedAt ?? null,
                    serviceIndex: row.outboxIndex,
                  },
                }),
              },
            });
            if (prepared !== null) {
              if (prepared.operationName !== 'replicate') {
                return yield* new ZerospinError({
                  code: 'replica-source-mutation-invalid',
                  message:
                    'Service source updates must produce replica resource mutations',
                });
              }
              const current = db
                .select()
                .from(prepared.model.drizzleSchema)
                .where(eq(prepared.model.drizzleSchema.id, prepared.resourceId))
                .get();
              if (current === undefined) {
                continue;
              }
              const enrollment = yield* Schema.decodeUnknownEffect(
                Schema.Struct({ serviceIndex: Schema.Number }),
              )(current).pipe(
                mapParseError({
                  code: 'replica-resource-invalid',
                  prefix: 'Invalid retained replica position',
                }),
              );
              if (row.outboxIndex <= enrollment.serviceIndex) {
                continue;
              }
              mutations.push({
                ...prepared,
                operation: {
                  ...prepared.operation,
                  serviceName: command.serviceName,
                  serviceVersion: row.executionVersion,
                  serviceIndex: row.outboxIndex,
                  resource: {
                    ...prepared.operation.resource,
                    serviceIndex: row.outboxIndex,
                  },
                },
              });
            }
          }
        }
      }
      inputs.push({ row, aggregateEntry, serviceEntry, mutations });
    }
    return yield* executeTx({
      inputs,
      aggregate,
      key,
      source: props.source,
    }).pipe(Effect.provideService(UserVersionedAggregateRepoDb, db));
  },
);
