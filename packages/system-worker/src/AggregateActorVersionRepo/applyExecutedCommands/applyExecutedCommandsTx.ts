import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import { applyExecutionDeltaTx } from '@zerospin/core/contracts/applyExecutionDeltaTx';
import {
  type AggregateExecutedCommandSchema,
  type ServiceExecutedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { prepareReplayAppliedMutation } from '@zerospin/core/contracts/prepareReplayAppliedMutation';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import { Model } from '@zerospin/core/models/defineModel';
import type { IAnyModels } from '@zerospin/core/models/types';
import { makeZerospinError } from '@zerospin/error';
import type config from 'config';
import { eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';

import type { IExecutedCommandRow } from '../../AggregateVersionChain/types.js';
import { genesisExecutedHash } from '../../executedDispositionHash/executedDispositionHash.js';
import { aggregateActorVersionRepoDbConfig } from '../aggregateActorVersionRepoDbConfig.js';
import { commitAggregateActorCommandTx } from '../commitAggregateActorCommandTx/commitAggregateActorCommandTx.js';
import { commitServiceActorCommandTx } from '../commitServiceActorCommandTx/commitServiceActorCommandTx.js';
import { readSelectedResources } from '../readSelectedResources.js';
import { resolveActorIdentity } from '../resolveActorIdentity/resolveActorIdentity.js';
import { commandRowForSource } from '../retainedCommands.js';

/** Atomically install aggregate executed deltas and enroll replica copies into one selected stream. */
export const applyExecutedCommandsTx = makeTx(
  'AggregateActorVersionRepo.applyExecutedCommandsTx',
)(function* (
  tx: ITx<
    IResourceDbConfig<
      IAnyModels,
      typeof aggregateActorVersionRepoDbConfig.tables
    >
  >,
  props: {
    inputs: Array<{
      row: IExecutedCommandRow;
      command:
        | typeof AggregateExecutedCommandSchema.Type
        | typeof ServiceExecutedCommandSchema.Type;
    }>;
    aggregate: (typeof config.system.aggregates)[string][string];
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
      actorName: string;
      actorVersion: string;
      actorPath: string;
    };
  },
) {
  const { inputs, aggregate, key } = props;
  const view = yield* resolveAggregateActorVersion(
    { [aggregate.version]: aggregate },
    key,
  );
  const identity = yield* resolveActorIdentity({
    aggregate,
    actorName: key.actorName,
    actorVersion: key.actorVersion,
    actorPath: key.actorPath,
  });

  // Owned rows can reference replicas installed later in this same materialization.
  tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
  const state = tx
    .select()
    .from(aggregateActorVersionRepoDbConfig.schema.actorState)
    .where(eq(aggregateActorVersionRepoDbConfig.schema.actorState.id, 1))
    .get();
  let cursor = state?.executedIndex ?? 0;
  let aggregateIndex = state?.aggregateIndex ?? 0;
  let executedHash = state?.executedHash ?? genesisExecutedHash();
  let graph = yield* readSelectedResources({
    db: tx,
    models: aggregate.models,
    selections: view.selections,
    identity,
  });

  for (const input of inputs) {
    const { row, command } = input;
    if (row.executedIndex <= cursor) {
      continue;
    }
    if (row.executedIndex !== cursor + 1) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'replica-command-index-gap',
          message: `Expected command ${cursor + 1}, received ${row.executedIndex}`,
        }),
      );
    }
    if (
      row.executionVersion !== key.aggregateVersion ||
      command.dispositionHash === null ||
      ('aggregateIndex' in command &&
        (command.aggregateId !== key.aggregateId ||
          command.aggregateName !== key.aggregateName))
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'replica-command-invalid',
          message:
            'Replica input is not its bound terminal aggregate occurrence',
        }),
      );
    }

    if (command.execution.status === 'succeeded') {
      const owned = (resource: { modelName: string }) => {
        const model = aggregate.models[resource.modelName];
        return model === undefined || !Model.isReplica(model);
      };
      yield* applyExecutionDeltaTx({
        tx,
        models: aggregate.models,
        executionDelta: {
          inserted: command.execution.executionDelta.inserted.filter(owned),
          updated: command.execution.executionDelta.updated.filter(owned),
          deleted: command.execution.executionDelta.deleted.filter(owned),
        },
      });
    }

    if (command.execution.status === 'succeeded') {
      for (const [mutationIndex, resource] of [
        ...command.execution.executionDelta.inserted,
        ...command.execution.executionDelta.updated,
        ...command.execution.executionDelta.deleted,
      ].entries()) {
        const model = aggregate.models[resource.modelName];
        if (model === undefined || !Model.isReplica(model)) continue;
        const mutation = yield* prepareReplayAppliedMutation({
          controller: aggregate,
          mutation: {
            modelName: resource.modelName,
            modelVersion: resource.version,
            resourceId: resource.id,
            operationName: 'replicate',
            operation: JSON.stringify({
              serviceName: model.serviceName,
              serviceVersion: aggregate.services[model.serviceName],
              serviceIndex: resource.serviceIndex,
              resource,
            }),
          },
        });
        if (mutation !== null) {
          yield* applyAggregateMutationTx({
            tx,
            mutation,
            commandId: command.id,
            mutationIndex,
            appliedAt: command.execution.startedAt,
          });
        }
      }
    }

    cursor = row.executedIndex;
    if ('aggregateIndex' in command) {
      aggregateIndex = command.aggregateIndex;
    }
    const projection = {
      tx,
      models: aggregate.models,
      selections: view.selections,
      identity,
      aggregateVersion: key.aggregateVersion,
      graph,
      previousExecutedHash: executedHash,
      aggregateIndex,
      executedIndex: cursor,
      commandId: command.id,
      sourceCommand: command,
      admission: command.admission,
      execution:
        command.execution.status === 'succeeded'
          ? {
              status: 'succeeded' as const,
              startedAt: command.execution.startedAt,
              completedAt: command.execution.completedAt,
            }
          : command.execution,
    };
    const committed = 'aggregateIndex' in command
      ? yield* commitAggregateActorCommandTx({
            ...projection,
            disposition:
              command.execution.status === 'succeeded' ? 'success' : 'failure',
            nodeId:
              command.actorName === key.actorName &&
              command.actorVersion === key.actorVersion
                ? command.nodeId
                : null,
            nodeIndex:
              command.actorName === key.actorName &&
              command.actorVersion === key.actorVersion
                ? command.nodeIndex
                : null,
            ownerClaims:
              command.nodeId !== null &&
              command.sessionName !== null &&
              command.actorName === key.actorName &&
              command.actorVersion === key.actorVersion
                ? command.claims
                : null,
            ownerSessionName:
              command.nodeId !== null &&
              command.actorName === key.actorName &&
              command.actorVersion === key.actorVersion
                ? command.sessionName
                : null,
        })
      : yield* commitServiceActorCommandTx({
          ...projection,
          disposition:
            command.execution.status === 'succeeded' ? 'success' : 'failure',
        });
    const saved = commandRowForSource(tx, command);
    if (saved !== undefined) {
      tx.update(aggregateActorVersionRepoDbConfig.schema.pendingCommands)
        .set({ resolvedAt: new Date() })
        .where(
          eq(
            aggregateActorVersionRepoDbConfig.schema.pendingCommands
              .commandRowId,
            saved.rowId,
          ),
        )
        .run();
    }
    executedHash = committed.executedHash;
    graph = committed.graph;
  }
});
