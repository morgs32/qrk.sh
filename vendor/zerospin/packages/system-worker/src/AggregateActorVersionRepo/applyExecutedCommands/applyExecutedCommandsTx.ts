import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import type { IAggregateBrowserCommand } from '@zerospin/core/aggregateSession/types';
import { applyOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import { prepareReplayAppliedOperation } from '@zerospin/core/contracts/prepareReplayAppliedOperation';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import type config from 'config';
import { eq, sql } from 'drizzle-orm';

import { aggregateVersionChainDbConfig } from '../../AggregateVersionChain/aggregateVersionChainDbConfig.js';
import {
  advanceExecutedHash,
  genesisExecutedHash,
} from '../../executedDispositionHash/executedDispositionHash.js';
import { decodeOwnedOperation } from '../../ownedOperations.js';
import { aggregateActorVersionRepoDbConfig } from '../aggregateActorVersionRepoDbConfig.js';
import { commitActorProjectionTx } from '../commitActorProjectionTx/commitActorProjectionTx.js';
import { readSelectedResources } from '../readSelectedResources.js';
import { resolveActorIdentity } from '../resolveActorIdentity/resolveActorIdentity.js';
import { commandRowForSource, commandRowInput } from '../retainedCommands.js';

import type { IResolvedActorInput } from './applyExecutedCommands.js';
/** Replay the owner's complete local order and publish selected outputs in one transaction. */
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
    inputs: readonly IResolvedActorInput[];
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
  tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
  const head = tx
    .select()
    .from(aggregateActorVersionRepoDbConfig.schema.actorState)
    .where(eq(aggregateActorVersionRepoDbConfig.schema.actorState.id, 1))
    .get();
  let cursor = head?.executedIndex ?? 0;
  let aggregateIndex = head?.aggregateIndex ?? 0;
  let executedHash = head?.executedHash ?? genesisExecutedHash();
  let graph = yield* readSelectedResources({
    db: tx,
    models: aggregate.models,
    selections: view.capturedSelections,
    identity,
  });
  for (const input of inputs) {
    if (input.executedIndex <= cursor) {
      continue;
    }
    if (input.executedIndex !== cursor + 1) {
      return yield* makeZerospinError('projection-result-index-gap');
    }
    let output: Omit<IAggregateBrowserCommand, 'delta'>;
    let ownerClaims: Readonly<Record<string, unknown>> | null = null;
    let ownerSessionName: string | null = null;
    let nodeId: string | null = null;
    let nodeIndex: number | null = null;
    {
      const { command: row, decodedCommand: command } = input;
      if (
        row.executedIndex !== input.executedIndex ||
        row.executionVersion !== key.aggregateVersion ||
        command.dispositionHash === null ||
        command.aggregateId !== key.aggregateId ||
        command.aggregateName !== key.aggregateName
      ) {
        return yield* makeZerospinError('projection-command-invalid');
      }
      if (
        command.execution.status !== 'succeeded' &&
        input.operations.length > 0
      ) {
        return yield* makeZerospinError('projection-operation-invalid');
      }
      for (const [ordinal, operationRow] of input.operations.entries()) {
        if ('asyncContractName' in operationRow) {
          yield* aggregateVersionChainDbConfig.tables.asyncOperations
            .decodeRow(operationRow)
            .pipe(
              mapParseError({
                code: 'projection-async-invalid',
                prefix: 'Invalid async output',
              }),
            );
          if (
            operationRow.commandId !== row.id ||
            operationRow.executedIndex !== input.executedIndex ||
            operationRow.operationIndex !== ordinal
          ) {
            return yield* makeZerospinError(
              'projection-async-association-invalid',
            );
          }
          continue;
        }
        yield* aggregateVersionChainDbConfig.tables.modelOperations
          .decodeRow(operationRow)
          .pipe(
            mapParseError({
              code: 'projection-operation-invalid',
              prefix: 'Invalid owned aggregate output',
            }),
          );
        if (
          operationRow.commandId !== row.id ||
          operationRow.executedIndex !== input.executedIndex ||
          operationRow.operationIndex !== ordinal
        ) {
          return yield* makeZerospinError('projection-operation-invalid');
        }
        const output = yield* decodeOwnedOperation(operationRow);
        const model = aggregate.models[output.modelName];
        if (model === undefined) {
          continue;
        }

        if (model.version !== output.modelVersion) {
          return yield* makeZerospinError(
            'projection-operation-model-mismatch',
          );
        }
        const operation = yield* prepareReplayAppliedOperation({
          controller: aggregate,
          operation: output,
        });
        yield* applyOperationTx({
          tx,
          operation,
          commandId: row.id,
          operationIndex: ordinal,
          appliedAt: operationRow.committedAt,
        });
      }
      aggregateIndex = command.aggregateIndex;
      executedHash = advanceExecutedHash({
        previousExecutedHash: executedHash,
        executedIndex: input.executedIndex,
        commandId: command.id,
        disposition:
          command.execution.status === 'succeeded' ? 'success' : 'failure',
        failure:
          command.admission.status === 'failed'
            ? command.admission.failure
            : command.execution.status === 'failed'
              ? command.execution.failure
              : null,
      });
      const ownsCompletion =
        command.nodeId !== null &&
        command.sessionName !== null &&
        command.actorName === key.actorName &&
        command.actorVersion === key.actorVersion;
      if (ownsCompletion) {
        nodeId = command.nodeId;
        nodeIndex = command.nodeIndex;
        ownerClaims = command.claims;
        ownerSessionName = command.sessionName;
      }
      output = {
        aggregateIndex,
        executedIndex: input.executedIndex,
        executedHash,
        id: command.id,
        commandName: command.commandName,
        admission: ownsCompletion ? command.admission : null,
        execution: ownsCompletion ? command.execution : null,
      };
      const saved = commandRowForSource(tx, command);
      const retained = yield* aggregateActorVersionRepoDbConfig.tables.commands
        .encodeRow({
          ...commandRowInput({
            rowId: saved?.rowId ?? `row_${crypto.randomUUID()}`,
            command,
            aggregateVersion: key.aggregateVersion,
          }),
          executedIndex: input.executedIndex,
          executedHash,
        })
        .pipe(
          mapParseError({
            code: 'projection-command-invalid',
            prefix: 'Invalid retained aggregate command',
          }),
        );
      tx.insert(aggregateActorVersionRepoDbConfig.schema.commands)
        .values(retained)
        .onConflictDoUpdate({
          target: aggregateActorVersionRepoDbConfig.schema.commands.rowId,
          set: retained,
        })
        .run();
      if (saved !== undefined) {
        tx.update(aggregateActorVersionRepoDbConfig.schema.stagedCommands)
          .set({ resolvedAt: new Date() })
          .where(
            eq(
              aggregateActorVersionRepoDbConfig.schema.stagedCommands
                .commandRowId,
              saved.rowId,
            ),
          )
          .run();
      }
    }
    cursor = input.executedIndex;
    const committed = yield* commitActorProjectionTx({
      tx,
      models: aggregate.models,
      selections: view.capturedSelections,
      identity,
      aggregateVersion: key.aggregateVersion,
      graph,
      executedHash,
      aggregateIndex,
      executedIndex: cursor,
      output,
      ownerClaims,
      ownerSessionName,
      nodeId,
      nodeIndex,
    });
    graph = committed.graph;
  }
});
