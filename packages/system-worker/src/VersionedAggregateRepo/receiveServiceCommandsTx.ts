import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import { ServiceExecutionEntrySchema } from '@zerospin/core/contracts/CommandSchema';
import { prepareReplayAppliedMutation } from '@zerospin/core/contracts/prepareReplayAppliedMutation';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import { Model } from '@zerospin/core/models/makeModel';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Schema } from 'effect';
import type { system } from 'system';

import {
  VersionedAggregateRepoDb,
  versionedAggregateRepoDbConfig,
} from './versionedAggregateRepoDbConfig.js';

/** Apply service deltas to enrolled replica resources and commit each consumed service position atomically. */
export const receiveServiceCommandsTx = makeTx(
  'VersionedAggregateRepo.receiveServiceCommandsTx',
  VersionedAggregateRepoDb,
)(function* (props: {
  rows: readonly {
    outboxIndex: number;
    entry: string;
    executionVersion: string;
  }[];
  sourceKey: { systemId: string; serviceName: string; serviceVersion: string };
  aggregate: (typeof system.aggregates)[string][string];
}) {
  const { rows, sourceKey, aggregate } = props;

  const tx = yield* VersionedAggregateRepoDb.Tx;
  for (const row of rows) {
    const entry = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ServiceExecutionEntrySchema),
    )(row.entry).pipe(
      mapParseError({
        code: 'replica-source-entry-invalid',
        prefix: 'Invalid finalized service entry',
      }),
    );
    const command = entry.command;
    const source = tx
      .select()
      .from(versionedAggregateRepoDbConfig.schema.services)
      .where(
        eq(
          versionedAggregateRepoDbConfig.schema.services.serviceName,
          command.serviceName,
        ),
      )
      .get();
    if (
      source === undefined ||
      command.serviceName !== sourceKey.serviceName ||
      row.executionVersion !== sourceKey.serviceVersion ||
      entry.preparationVersion !== row.executionVersion ||
      aggregate.services[command.serviceName] !== row.executionVersion ||
      command.serviceIndex !== row.outboxIndex ||
      command.delta === null ||
      command.dispositionHash === null
    ) {
      return yield* new ZerospinError({
        code: 'replica-source-invalid',
        message:
          'Service delivery must match an enrolled pinned source and terminal occurrence',
      });
    }
    if (command.serviceIndex <= source.lastIndex) {
      continue;
    }
    if (command.serviceIndex !== source.lastIndex + 1) {
      return yield* new ZerospinError({
        code: 'replica-source-gap',
        message: 'Service delivery must be contiguous',
      });
    }
    if (command.failedAt === null) {
      for (const [mutationIndex, resource] of [
        ...command.delta.inserted,
        ...command.delta.updated,
        ...command.delta.deleted,
      ].entries()) {
        const model = aggregate.models[resource.modelName];
        if (
          !model ||
          !Model.isReplica(model) ||
          model.serviceName !== command.serviceName
        ) {
          continue;
        }
        const mutation = yield* prepareReplayAppliedMutation({
          controller: aggregate,
          mutation: {
            modelName: resource.modelName,
            modelVersion: resource.version,
            resourceId: resource.id,
            operationName: 'replicate',
            operation: JSON.stringify({
              serviceName: command.serviceName,
              serviceVersion: row.executionVersion,
              serviceIndex: command.serviceIndex,
              resource: {
                ...resource,
                deletedAt: resource.deletedAt ?? null,
                serviceIndex: command.serviceIndex,
              },
            }),
          },
        });
        if (mutation !== null && mutation.operationName !== 'replicate') {
          return yield* new ZerospinError({
            code: 'replica-source-mutation-invalid',
            message:
              'Service source updates must produce replica resource mutations',
          });
        }
        if (mutation === null) {
          continue;
        }
        const current = tx
          .select()
          .from(mutation.model.drizzleSchema)
          .where(eq(mutation.model.drizzleSchema.id, mutation.resourceId))
          .get();
        if (current === undefined) {
          continue;
        }
        const retained = yield* Schema.decodeUnknownEffect(
          Schema.Struct({ serviceIndex: Schema.Number }),
        )(current).pipe(
          mapParseError({
            code: 'replica-resource-invalid',
            prefix: 'Invalid retained replica position',
          }),
        );
        if (retained.serviceIndex >= command.serviceIndex) {
          continue;
        }
        yield* applyAggregateMutationTx({
          tx,
          mutation,
          commandId: command.id,
          mutationIndex,
          appliedAt: entry.executionTimestamp,
        });
      }
    }
    tx.update(versionedAggregateRepoDbConfig.schema.services)
      .set({
        lastIndex: command.serviceIndex,
      })
      .where(
        eq(
          versionedAggregateRepoDbConfig.schema.services.serviceName,
          command.serviceName,
        ),
      )
      .run();
  }
});
