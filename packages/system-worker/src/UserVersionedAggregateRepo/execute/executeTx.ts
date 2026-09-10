import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import type {
  AggregateExecutionEntrySchema,
  ServiceExecutionEntrySchema,
} from '@zerospin/core/contracts/CommandSchema';
import type { IAnyMutation } from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { getGraph } from '@zerospin/core/models/getGraph';
import { AggregateFrontendFinalizedCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import type { system } from 'system';

import { type versionedAggregateChainDbConfig } from '../../VersionedAggregateChain/versionedAggregateChainDbConfig.js';
import type { versionedServiceChainDbConfig } from '../../VersionedServiceChain/versionedServiceChainDbConfig.js';
import {
  UserVersionedAggregateRepoDb,
  userVersionedAggregateRepoDbConfig,
} from '../userVersionedAggregateRepoDbConfig.js';

/** Atomically replay prepared aggregate and service inputs and retain the resulting frontend output and checkpoint. */
export const executeTx = makeTx(
  'UserVersionedAggregateRepo.executeTx',
  UserVersionedAggregateRepoDb,
)(function* (props: {
  inputs: Array<{
    row:
      | typeof versionedAggregateChainDbConfig.schema.commands.$inferSelect
      | typeof versionedServiceChainDbConfig.schema.commands.$inferSelect;
    aggregateEntry: Schema.Schema.Type<
      typeof AggregateExecutionEntrySchema
    > | null;
    serviceEntry: Schema.Schema.Type<typeof ServiceExecutionEntrySchema> | null;
    mutations: IAnyMutation[];
  }>;
  aggregate: (typeof system.aggregates)[string][string];
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: string;
    userId: string;
  };
  source: { serviceName: string; serviceVersion: string } | undefined;
}) {
  const { inputs, aggregate, key } = props;

  const tx = yield* UserVersionedAggregateRepoDb.Tx;
  // 2 — decode the stored graph and restore its aggregate cursor
  const state = tx
    .select()
    .from(userVersionedAggregateRepoDbConfig.schema.projectionState)
    .where(eq(userVersionedAggregateRepoDbConfig.schema.projectionState.id, 1))
    .get();
  let cursor = state?.aggregateIndex ?? 0;
  let userIndex = state?.userIndex ?? 0;
  let canonicalBytes = state?.canonicalBytes ?? '';
  let graph =
    state === undefined
      ? []
      : yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Array(EncodedResourceSchema)),
        )(state.graph).pipe(
          mapParseError({
            code: 'replica-graph-invalid',
            prefix: 'Failed to decode preceding selected graph',
          }),
        );

  // 3 — skip committed positions, compare repeated head bytes, and reject gaps
  for (const input of inputs) {
    const { row, aggregateEntry, serviceEntry } = input;
    const executionEntry = aggregateEntry ?? serviceEntry;
    if (executionEntry === null) {
      return yield* new ZerospinError({
        code: 'replica-command-invalid',
        message: 'Replica input has no terminal entry',
      });
    }
    if (aggregateEntry !== null) {
      if (row.outboxIndex <= cursor) {
        if (row.outboxIndex === cursor && canonicalBytes !== row.entry) {
          return yield* new ZerospinError({
            code: 'replica-command-conflict',
            message: 'Repeated command differs from the durable replica head',
          });
        }
        continue;
      }
      if (row.outboxIndex !== cursor + 1) {
        return yield* new ZerospinError({
          code: 'replica-command-index-gap',
          message: `Expected command ${cursor + 1}, received ${row.outboxIndex}`,
        });
      }
      const command = aggregateEntry.command;
      if (
        row.executionVersion !== key.aggregateVersion ||
        command.aggregateIndex !== row.outboxIndex ||
        command.dispositionHash === null ||
        command.aggregateId !== key.aggregateId ||
        command.aggregateName !== key.aggregateName
      ) {
        return yield* new ZerospinError({
          code: 'replica-command-invalid',
          message:
            'Replica input is not its bound terminal aggregate occurrence',
        });
      }
    }
    if (serviceEntry !== null) {
      const source = tx
        .select()
        .from(userVersionedAggregateRepoDbConfig.schema.services)
        .where(
          eq(
            userVersionedAggregateRepoDbConfig.schema.services.serviceName,
            serviceEntry.command.serviceName,
          ),
        )
        .get();
      if (
        source === undefined ||
        aggregate.services[serviceEntry.command.serviceName] !==
          row.executionVersion ||
        serviceEntry.command.serviceName !== props.source?.serviceName ||
        row.executionVersion !== props.source?.serviceVersion
      ) {
        return yield* new ZerospinError({
          code: 'replica-source-not-enrolled',
          message: 'Service delivery has no committed source enrollment',
        });
      }
      if (row.outboxIndex <= source.lastIndex) {
        continue;
      }
      if (row.outboxIndex !== source.lastIndex + 1) {
        return yield* new ZerospinError({
          code: 'replica-source-index-gap',
          message: `Expected source command ${source.lastIndex + 1}, received ${row.outboxIndex}`,
        });
      }
    }

    // 5 — successful aggregate mutations enroll copies; source occurrences update enrolled copies only.
    for (const [mutationIndex, mutation] of input.mutations.entries()) {
      if (mutation.operationName === 'replicate') {
        const { serviceName, serviceVersion, serviceIndex } =
          mutation.operation;
        if (serviceVersion === undefined || serviceIndex === undefined) {
          return yield* new ZerospinError({
            code: 'replica-source-metadata-invalid',
            message:
              'Committed replication requires source version and position',
          });
        }
        const current = tx
          .select()
          .from(mutation.model.drizzleSchema)
          .where(eq(mutation.model.drizzleSchema.id, mutation.resourceId))
          .get();
        const enrolled =
          current === undefined
            ? undefined
            : yield* Schema.decodeUnknownEffect(
                Schema.Struct({ serviceIndex: Schema.Number }),
              )(current).pipe(
                mapParseError({
                  code: 'replica-resource-invalid',
                  prefix: 'Invalid retained replica position',
                }),
              );
        const source = tx
          .select()
          .from(userVersionedAggregateRepoDbConfig.schema.services)
          .where(
            eq(
              userVersionedAggregateRepoDbConfig.schema.services.serviceName,
              serviceName,
            ),
          )
          .get();
        if (serviceEntry !== null && enrolled === undefined) continue;
        if (
          source === undefined ||
          aggregate.services[serviceName] !== serviceVersion
        ) {
          return yield* new ZerospinError({
            code: 'replica-source-target-mismatch',
            message: 'Replica mutation changed its pinned source version',
          });
        }
        if (
          enrolled !== undefined &&
          serviceIndex <= Math.max(enrolled.serviceIndex, source.lastIndex)
        ) {
          continue;
        }
      }
      yield* applyAggregateMutationTx({
        tx,
        mutation,
        commandId: executionEntry.command.id,
        mutationIndex,
        appliedAt: executionEntry.executionTimestamp,
      });
    }
    if (aggregateEntry !== null) {
      cursor = row.outboxIndex;
      canonicalBytes = row.entry;
    }
    if (serviceEntry !== null) {
      tx.update(userVersionedAggregateRepoDbConfig.schema.services)
        .set({ lastIndex: row.outboxIndex })
        .where(
          eq(
            userVersionedAggregateRepoDbConfig.schema.services.serviceName,
            serviceEntry.command.serviceName,
          ),
        )
        .run();
    }
    userIndex += 1;

    // 6 — select this user's resources across every model in the aggregate version
    const selected = getGraph({
      db: tx,
      models: aggregate.models,
      selections: aggregate.selections,
      userId: key.userId,
    });
    const nextGraph = [];
    for (const resource of Object.values(selected)) {
      const model = yield* getByKeyOrThrow({
        record: aggregate.models,
        key: resource.modelName,
        recordKind: 'aggregate models',
      });
      const decoded = yield* Schema.decodeUnknownEffect(
        makeEffectSchema(model.propertiesShape),
      )(resource).pipe(
        Effect.flatMap(row =>
          Schema.decodeUnknownEffect(Schema.toType(model.resourceSchema))(row),
        ),
        mapParseError({
          code: 'replica-projected-resource-invalid',
          prefix: 'Invalid selected aggregate resource',
        }),
      );
      const encoded = yield* Schema.encodeEffect(model.resourceSchema)(
        decoded,
      ).pipe(
        mapParseError({
          code: 'replica-projected-resource-invalid',
          prefix: 'Invalid selected aggregate resource',
        }),
      );
      nextGraph.push(
        yield* Schema.decodeUnknownEffect(EncodedResourceSchema)(encoded).pipe(
          mapParseError({
            code: 'replica-projected-resource-invalid',
            prefix: 'Invalid selected aggregate resource',
          }),
        ),
      );
    }

    // 7 — key resources by modelName plus id and derive inserted, updated, and deleted sets
    const before = new Map(
      graph.map(resource => [
        `${resource.modelName}\u0000${resource.id}`,
        resource,
      ]),
    );
    const after = new Map(
      nextGraph.map(resource => [
        `${resource.modelName}\u0000${resource.id}`,
        resource,
      ]),
    );
    const delta = {
      inserted: nextGraph.filter(
        resource => !before.has(`${resource.modelName}\u0000${resource.id}`),
      ),
      updated: nextGraph.filter(resource => {
        const previous = before.get(
          `${resource.modelName}\u0000${resource.id}`,
        );
        return (
          previous !== undefined &&
          JSON.stringify(previous) !== JSON.stringify(resource)
        );
      }),
      deleted: graph
        .filter(
          resource => !after.has(`${resource.modelName}\u0000${resource.id}`),
        )
        .map(resource => ({
          modelName: resource.modelName,
          id: resource.id,
        })),
      mutations: [],
    };

    // 8 — emit progress even for an empty delta; include the full entry only for this user
    const resolution =
      aggregateEntry !== null && aggregateEntry.command.userId === key.userId
        ? aggregateEntry
        : null;
    const output = yield* Schema.encodeEffect(
      Schema.fromJsonString(AggregateFrontendFinalizedCommandSchema),
    )({ userIndex, aggregateIndex: cursor, delta, resolution }).pipe(
      mapParseError({
        code: 'replica-output-invalid',
        prefix: 'Failed to encode frontend output',
      }),
    );
    const graphBytes = yield* Schema.encodeEffect(
      Schema.fromJsonString(Schema.Array(EncodedResourceSchema)),
    )(nextGraph).pipe(
      mapParseError({
        code: 'replica-graph-invalid',
        prefix: 'Failed to encode selected graph',
      }),
    );

    // 9 — write the delta outbox, source bytes, graph, and cursor in the replay transaction
    tx.insert(userVersionedAggregateRepoDbConfig.schema.deltas)
      .values({
        outboxIndex: userIndex,
        output,
        deliveredAt: null,
        lastDeliveryFailure: null,
      })
      .run();
    tx.insert(userVersionedAggregateRepoDbConfig.schema.projectionState)
      .values({
        id: 1,
        aggregateIndex: cursor,
        userIndex,
        aggregateVersion: key.aggregateVersion,
        canonicalBytes,
        graph: graphBytes,
      })
      .onConflictDoUpdate({
        target: userVersionedAggregateRepoDbConfig.schema.projectionState.id,
        set: {
          aggregateIndex: cursor,
          userIndex,
          aggregateVersion: key.aggregateVersion,
          canonicalBytes,
          graph: graphBytes,
        },
      })
      .run();
    graph = nextGraph;
  }
});
