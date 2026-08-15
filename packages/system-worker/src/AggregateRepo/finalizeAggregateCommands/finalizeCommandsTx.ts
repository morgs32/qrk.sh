/*
 * System-worker annotation:
 * Finalizes aggregate commands inside the already-open AggregateRepo transaction.
 * Prepared command failures become failed command rows before any mutation
 * writes; successful prepared mutations are applied and encoded atomically.
 */

import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import {
  EncodedExecutedAggregateCommandSchema,
  EncodedFailedAggregateCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { commitAppliedMutationTx } from '@zerospin/core/contracts/commitAppliedMutationTx';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedAggregateCommand,
  IFailedAggregateCommand,
} from '@zerospin/core/contracts/types';
import type { ITx } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { dutils } from '@zerospin/core/utils/dutils';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { makeCursor } from '@zerospin/core/utils/makeCursor';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';
import { system } from 'system';

import { getLastAggregateIndex } from '../../getLastAggregateCursor/getLastAggregateCursor.js';
import { systemWorkerAbbreviations } from '../../systemWorkerAbbreviations.js';
import { aggregateRepoDrizzleSchemas } from '../AggregateRepo.js';

import { makeAggregateBlockTx } from './makeAggregateBlockTx.js';
import type { prepareAggregateCommands } from './prepareAggregateCommands.js';
import { upsertAggregateBlockTx } from './upsertAggregateBlockTx.js';

/*
 * 1. Resolve aggregate models and start from the current aggregate index.
 * 2. Process service groups and retained blocks in deterministic order.
 * 3. Apply service mutations only to existing service-owned model rows.
 * 4. Emit one commandless AggregateBlock per relevant source ServiceBlock.
 * 5. Commit each aligned service watermark at snapshot W.
 * 6. Apply successful command mutations after every old projection reaches W.
 * 7. Allocate authoritative command outcomes after intermediate AggregateBlocks.
 * 8. Return the final command block contents to the caller's open transaction.
 */
export const finalizeCommandsTx = Effect.fn('AggregateRepo.finalizeCommandsTx')(
  function* (props: {
    aggregateName: string;
    preparedCommands: Effect.Effect.Success<
      ReturnType<typeof prepareAggregateCommands>
    >['preparedCommands'];
    serviceAlignments: Effect.Effect.Success<
      ReturnType<typeof prepareAggregateCommands>
    >['serviceAlignments'];
    storage: DurableObjectStorage;
    tx: ITx;
  }): Effect.fn.Return<
    Readonly<{
      executedCommands: readonly IExecutedAggregateCommand[];
      encodedExecutedCommands: readonly IEncodedCommand<IExecutedAggregateCommand>[];
      failedCommands: readonly IFailedAggregateCommand[];
      encodedFailedCommands: readonly IEncodedCommand<IFailedAggregateCommand>[];
      appliedMutations: readonly IEncodedAppliedMutation[];
    }>,
    IAnyError,
    CuidFactory | MonotonicFactory
  > {
    const { aggregateName, preparedCommands, serviceAlignments, storage, tx } =
      props;

    // 1 — resolve the aggregate once for ownership checks and dynamic model tables
    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: aggregateName,
      recordKind: 'aggregates',
    });
    let currentAggregateIndex = yield* getLastAggregateIndex({
      storage,
      defaultValue: 0,
    });
    const executedCommands: IExecutedAggregateCommand[] = [];
    const encodedExecutedCommands: IEncodedCommand<IExecutedAggregateCommand>[] =
      [];
    const failedCommands: IFailedAggregateCommand[] = [];
    const encodedFailedCommands: IEncodedCommand<IFailedAggregateCommand>[] =
      [];
    const appliedMutations: IEncodedAppliedMutation[] = [];

    // 2 — first-appearance service order is preserved independently of RPC completion order
    for (const serviceAlignment of serviceAlignments) {
      const persistedServiceRepoName = yield* Schema.decodeUnknown(
        makeAbbreviationIdSchema(systemWorkerAbbreviations.serviceRepo),
      )(serviceAlignment.serviceRepoName).pipe(
        mapParseError({
          code: 'aggregate-service-repo-name-decode-failed',
          prefix: 'Failed to decode AggregateRepo serviceRepoName',
        }),
      );
      const subscription = tx
        .select()
        .from(aggregateRepoDrizzleSchemas.serviceSubscriptions)
        .where(
          eq(
            aggregateRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
            persistedServiceRepoName,
          ),
        )
        .get();
      if (
        subscription !== undefined &&
        subscription.serviceName !== serviceAlignment.serviceName
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-service-subscription-name-mismatch',
          message: `Subscription ${serviceAlignment.serviceRepoName} belongs to service "${subscription.serviceName}", not "${serviceAlignment.serviceName}"`,
        });
      }
      if (
        (subscription?.currentServiceIndex ?? null) !==
        serviceAlignment.currentServiceIndex
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-service-subscription-watermark-changed',
          message: `Subscription ${serviceAlignment.serviceRepoName} changed after its grouped snapshot was prepared`,
        });
      }
      let currentServiceIndex = serviceAlignment.currentServiceIndex ?? 0;
      const orderedBlocks = [...serviceAlignment.serviceBlocks].sort(
        (left, right) => left.serviceIndex - right.serviceIndex,
      );

      for (const block of orderedBlocks) {
        if (block.serviceIndex <= currentServiceIndex) {
          continue;
        }
        const relevantMutations: IEncodedAppliedMutation[] = [];

        // 3 — row existence is replication membership; an absent create does not join early
        for (const mutation of block.appliedMutations) {
          if (mutation.operationName === 'replicateResource') {
            continue;
          }
          const model = yield* getByKeyOrThrow({
            record: aggregate.models,
            key: mutation.modelName,
            recordKind: `models owned by aggregate ${aggregateName}`,
          });
          if (
            !('serviceName' in model) ||
            model.serviceName !== serviceAlignment.serviceName
          ) {
            return yield* new ZerospinError({
              code: 'replication-service-model-mismatch',
              message: `Service block model "${mutation.modelName}" is not owned by service "${serviceAlignment.serviceName}"`,
            });
          }
          const existingResource = tx
            .select()
            .from(model.drizzleSchema)
            .where(eq(model.drizzleSchema.id, mutation.resourceId))
            .get();
          if (existingResource === undefined) {
            continue;
          }
          yield* commitAppliedMutationTx({
            tx,
            models: aggregate.models,
            mutation,
          });
          relevantMutations.push(mutation);
        }
        currentServiceIndex = block.serviceIndex;

        if (relevantMutations.length === 0) {
          continue;
        }

        // 4 — preserve the source ServiceBlock boundary before the later command block
        currentAggregateIndex += 1;
        const lastAggregateCursor = yield* makeCursor({
          abbreviation: coreAbbreviations.aggregateCursor,
        });
        const aggregateBlock = yield* makeAggregateBlockTx({
          writeIndex: block.writeIndex,
          executedCommands: [],
          failedCommands: [],
          appliedMutations: relevantMutations,
          lastAggregateCursor,
          aggregateIndex: currentAggregateIndex,
          storage,
          tx,
        });
        yield* upsertAggregateBlockTx({
          aggregateBlock: {
            ...aggregateBlock,
            publishedAt: null,
            failure: null,
          },
          tx,
        });
      }

      if (
        serviceAlignment.currentServiceIndex !== null &&
        currentServiceIndex !== serviceAlignment.serviceIndex
      ) {
        return yield* new ZerospinError({
          code: 'service-alignment-range-incomplete',
          message: `Service ${serviceAlignment.serviceName} alignment did not reach snapshot index ${serviceAlignment.serviceIndex}`,
        });
      }

      // 5 — the one service subscription advances through every processed block, relevant or not
      if (subscription === undefined) {
        tx.insert(aggregateRepoDrizzleSchemas.serviceSubscriptions)
          .values({
            serviceRepoName: persistedServiceRepoName,
            serviceName: serviceAlignment.serviceName,
            currentServiceCursor: serviceAlignment.lastServiceCursor,
            currentServiceIndex: serviceAlignment.serviceIndex,
            subscribedAt: null,
            failure: null,
          })
          .run();
      } else {
        tx.update(aggregateRepoDrizzleSchemas.serviceSubscriptions)
          .set({
            currentServiceCursor: serviceAlignment.lastServiceCursor,
            currentServiceIndex: serviceAlignment.serviceIndex,
          })
          .where(
            eq(
              aggregateRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
              persistedServiceRepoName,
            ),
          )
          .run();
      }
    }

    // 6 — canonical snapshots join only after every existing service projection has reached its W
    const now = yield* dutils.date();
    for (const preparedCommand of preparedCommands) {
      const { command } = preparedCommand;

      // 7 — intermediate commandless blocks already consumed earlier aggregate positions
      currentAggregateIndex += 1;
      const aggregateCursor = yield* makeCursor({
        abbreviation: coreAbbreviations.aggregateCursor,
      });
      const maybeMutations = preparedCommand.mutations;

      if (Either.isLeft(maybeMutations)) {
        const failedCommand = {
          ...command,
          aggregateCursor,
          aggregateIndex: currentAggregateIndex,
          failedAt: now,
          failure: ZerospinError.stringify(maybeMutations.left),
          status: 'failed',
        } satisfies IFailedAggregateCommand;
        failedCommands.push(failedCommand);
        encodedFailedCommands.push(
          yield* Schema.validate(EncodedFailedAggregateCommandSchema)(
            {
              ...failedCommand,
              payload: preparedCommand.encodedCommand.payload,
            },
            { onExcessProperty: 'error' },
          ).pipe(
            mapParseError({
              code: 'system-runtime-failed-aggregate-command-encoding-invalid',
              prefix: `Dynamic aggregate command encoding ${aggregateName}.${command.commandName} produced an invalid failed command`,
            }),
          ),
        );
        continue;
      }

      const maybeAppliedMutations = yield* withSavepoint({
        tx,
        program: Effect.fn('AggregateRepo.finalizeCommandsTx.commandSavepoint')(
          function* ({ tx }) {
            const commandAppliedMutations: IEncodedAppliedMutation[] = [];
            for (const [
              mutationIndex,
              mutation,
            ] of maybeMutations.right.mutations.entries()) {
              const appliedMutation = yield* applyAggregateMutationTx({
                tx,
                mutation,
                commandId: command.id,
                mutationIndex,
                appliedAt: now,
              });
              commandAppliedMutations.push(
                yield* encodeAppliedMutation({ mutation: appliedMutation }),
              );
            }
            return commandAppliedMutations;
          },
        ),
      }).pipe(Effect.either);

      if (Either.isLeft(maybeAppliedMutations)) {
        const failedCommand = {
          ...command,
          aggregateCursor,
          aggregateIndex: currentAggregateIndex,
          failedAt: now,
          failure: ZerospinError.stringify(maybeAppliedMutations.left),
          status: 'failed',
        } satisfies IFailedAggregateCommand;
        failedCommands.push(failedCommand);
        encodedFailedCommands.push(
          yield* Schema.validate(EncodedFailedAggregateCommandSchema)(
            {
              ...failedCommand,
              payload: preparedCommand.encodedCommand.payload,
            },
            { onExcessProperty: 'error' },
          ).pipe(
            mapParseError({
              code: 'system-runtime-failed-aggregate-command-encoding-invalid',
              prefix: `Dynamic aggregate command encoding ${aggregateName}.${command.commandName} produced an invalid failed command`,
            }),
          ),
        );
        continue;
      }

      appliedMutations.push(...maybeAppliedMutations.right);

      const executedCommand = {
        ...command,
        mode: 'authoritative',
        aggregateCursor,
        aggregateIndex: currentAggregateIndex,
        executedAt: now,
        status: 'executed',
      } satisfies IExecutedAggregateCommand;
      executedCommands.push(executedCommand);
      encodedExecutedCommands.push(
        yield* Schema.validate(EncodedExecutedAggregateCommandSchema)(
          {
            ...executedCommand,
            payload: preparedCommand.encodedCommand.payload,
          },
          { onExcessProperty: 'error' },
        ).pipe(
          mapParseError({
            code: 'system-runtime-executed-aggregate-command-encoding-invalid',
            prefix: `Dynamic aggregate command encoding ${aggregateName}.${command.commandName} produced an invalid executed command`,
          }),
        ),
      );
    }

    // 8 — the caller creates the final command AggregateBlock after all intermediate rows
    return {
      executedCommands,
      encodedExecutedCommands,
      failedCommands,
      encodedFailedCommands,
      appliedMutations,
    };
  },
);
