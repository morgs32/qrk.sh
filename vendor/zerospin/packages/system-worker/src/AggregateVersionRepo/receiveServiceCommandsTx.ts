import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import { ServiceExecutedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { prepareReplayAppliedMutation } from '@zerospin/core/contracts/prepareReplayAppliedMutation';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import { Model } from '@zerospin/core/models/defineModel';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type {
  IAnyModels,
  IEncodedDeletedResourceShape,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import type config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { serviceVersionChainDbConfig } from '../ServiceVersionChain/serviceVersionChainDbConfig.js';

import { aggregateVersionRepoDbConfig } from './aggregateVersionRepoDbConfig.js';

/** Apply service deltas to enrolled replica resources and commit each consumed service position atomically. */
export const receiveServiceCommandsTx = makeTx(
  'AggregateVersionRepo.receiveServiceCommandsTx',
)(function* (
  tx: ITx<
    IResourceDbConfig<IAnyModels, typeof aggregateVersionRepoDbConfig.tables>
  >,
  props: {
    rows: readonly (typeof serviceVersionChainDbConfig.schema.commands.$inferSelect)[];
    sourceKey: {
      systemId: string;
      serviceName: string;
      serviceVersion: string;
    };
    aggregate: (typeof config.system.aggregates)[string][string];
  },
) {
  const { rows, sourceKey, aggregate } = props;

  for (const row of rows) {
    const command = yield* serviceVersionChainDbConfig.tables.commands
      .decodeRow(row)
      .pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.toType(ServiceExecutedCommandSchema),
          ),
        ),
      )
      .pipe(
        mapParseError({
          code: 'replica-source-command-invalid',
          prefix: 'Invalid finalized service executedCommand',
        }),
      );
    const source = tx
      .select()
      .from(aggregateVersionRepoDbConfig.schema.services)
      .where(
        eq(
          aggregateVersionRepoDbConfig.schema.services.serviceName,
          command.serviceName,
        ),
      )
      .get();
    if (
      source === undefined ||
      command.serviceName !== sourceKey.serviceName ||
      row.executionVersion !== sourceKey.serviceVersion ||
      aggregate.services[command.serviceName] !== row.executionVersion ||
      command.execution.status !== 'succeeded' ||
      command.dispositionHash === null
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'replica-source-invalid',
          message:
            'Service delivery must match an enrolled pinned source and terminal occurrence',
        }),
      );
    }
    if (command.serviceIndex <= source.lastIndex) {
      continue;
    }
    if (command.serviceIndex !== source.lastIndex + 1) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'replica-source-gap',
          message: 'Service delivery must be contiguous',
        }),
      );
    }
    const updated: IEncodedResourceShape[] = [];
    const deleted: IEncodedDeletedResourceShape[] = [];
    const head = tx
      .select()
      .from(aggregateVersionRepoDbConfig.schema.head)
      .where(eq(aggregateVersionRepoDbConfig.schema.head.singletonId, 1))
      .get();
    if (head === undefined) {
      return yield* Effect.fail(makeZerospinError('aggregate-head-missing'));
    }
    const executedIndex = head.executedIndex + 1;
    if (command.execution.status === 'succeeded') {
      for (const [mutationIndex, resource] of [
        ...command.execution.executionDelta.inserted,
        ...command.execution.executionDelta.updated,
        ...command.execution.executionDelta.deleted,
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
          return yield* Effect.fail(
            makeZerospinError({
              code: 'replica-source-mutation-invalid',
              message:
                'Service source updates must produce replica resource mutations',
            }),
          );
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
        const appliedMutation = yield* applyAggregateMutationTx({
          tx,
          mutation,
          commandId: command.id,
          mutationIndex,
          appliedAt: command.execution.startedAt,
        });
        const encoded = yield* encodeAppliedMutation({
          mutation: appliedMutation,
        });
        const bytes = yield* aggregateVersionRepoDbConfig.tables.mutations
          .encodeRow({
            ...encoded,
            id: `${executedIndex}/${mutationIndex}`,
            executedIndex,
          })
          .pipe(
            mapParseError({
              code: 'mutation-row-encode-failed',
              prefix: 'Invalid applied mutation',
            }),
          );
        tx.insert(aggregateVersionRepoDbConfig.schema.mutations)
          .values(bytes)
          .run();
        const applied = tx
          .select()
          .from(mutation.model.drizzleSchema)
          .where(eq(mutation.model.drizzleSchema.id, mutation.resourceId))
          .get();
        const effective = yield* Schema.decodeUnknownEffect(
          Schema.toType(EncodedResourceSchema),
        )(applied).pipe(
          mapParseError({
            code: 'replica-resource-invalid',
            prefix: 'Invalid applied replica',
          }),
        );
        if (effective.deletedAt != null) {
          deleted.push({ ...effective, deletedAt: effective.deletedAt });
        } else {
          updated.push(effective);
        }
      }
    }
    const terminal = yield* aggregateVersionRepoDbConfig.tables.serviceCommands
      .encodeRow({
        ...command,
        execution:
          command.execution.status === 'succeeded'
            ? {
                ...command.execution,
                executionDelta: { inserted: [], updated, deleted },
              }
            : command.execution,
        executedIndex,
        executionVersion: aggregate.version,
        acknowledgedAt: null,
        lastDeliveryFailure: null,
      })
      .pipe(
        mapParseError({
          code: 'materialization-encode-failed',
          prefix: 'Invalid service application',
        }),
      );
    tx.insert(aggregateVersionRepoDbConfig.schema.serviceCommands)
      .values(terminal)
      .run();
    tx.update(aggregateVersionRepoDbConfig.schema.head)
      .set({ executedIndex })
      .where(eq(aggregateVersionRepoDbConfig.schema.head.singletonId, 1))
      .run();
    tx.update(aggregateVersionRepoDbConfig.schema.services)
      .set({
        lastIndex: command.serviceIndex,
      })
      .where(
        eq(
          aggregateVersionRepoDbConfig.schema.services.serviceName,
          command.serviceName,
        ),
      )
      .run();
  }
});
