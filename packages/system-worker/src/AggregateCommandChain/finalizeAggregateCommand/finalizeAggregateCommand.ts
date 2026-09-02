import {
  AggregateChainedCommandSchema,
  EncodedAggregateCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import type { Semaphore } from 'effect/Semaphore';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { MaterializedAggregateRepo } from '../../MaterializedAggregateRepo/MaterializedAggregateRepo.js';
import { aggregateCommandChainDrizzleSchemas } from '../AggregateCommandChainDbConfig.js';
import { runScheduledWork } from '../runScheduledWork/runScheduledWork.js';

export const finalizeAggregateCommand = Effect.fn(
  'AggregateCommandChain.finalizeAggregateCommand',
)(function* (props: {
  command: IEncodedCommand<IAggregateCommand>;
  admissionSemaphore: Semaphore;
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  key: { systemId: string; aggregateId: string; aggregateName: string };
  materializedAggregateFrontendRepos: Cloudflare.Env['MATERIALIZED_AGGREGATE_FRONTEND_REPO'];
  materializedAggregateRepos: Cloudflare.Env['MATERIALIZED_AGGREGATE_REPO'];
  storage: DurableObjectStorage;
}) {
  const { command, db, key } = props;
  if (
    command.aggregateId !== key.aggregateId ||
    command.aggregateName !== key.aggregateName
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-command-chain-target-mismatch',
      message:
        'Aggregate command does not match its bound AggregateCommandChain',
    });
  }
  const halted = db
    .select()
    .from(aggregateCommandChainDrizzleSchemas.chainState)
    .where(eq(aggregateCommandChainDrizzleSchemas.chainState.id, 1))
    .get();
  if (halted?.haltedAt !== null && halted?.haltedAt !== undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-command-chain-halted',
      message: 'AggregateCommandChain is halted for execution repair',
      ...(halted.failure === null ? {} : { cause: halted.failure }),
    });
  }

  const canonicalBytes = yield* Schema.encodeEffect(
    Schema.fromJsonString(EncodedAggregateCommandSchema),
  )(command).pipe(
    mapParseError({
      code: 'aggregate-command-chain-command-encode-failed',
      prefix: `Failed to encode aggregate command ${command.id}`,
    }),
  );
  const row = yield* props.admissionSemaphore.withPermits(1)(
    Effect.gen(function* () {
      const retained = db
        .select()
        .from(aggregateCommandChainDrizzleSchemas.commands)
        .where(
          eq(
            aggregateCommandChainDrizzleSchemas.commands.commandId,
            command.id,
          ),
        )
        .get();
      if (retained !== undefined) {
        if (retained.canonicalBytes !== canonicalBytes) {
          return yield* new ZerospinError({
            code: 'aggregate-command-chain-command-conflict',
            message: `Aggregate command ${command.id} differs from its retained bytes`,
          });
        }
        return retained;
      }

      const materializedAggregateRepoName =
        yield* MaterializedAggregateRepo.fixedDORepoConfig.nameUtils.makeName(
          key,
        );
      const chainedAt = new Date();
      yield* Effect.try({
        try: () =>
          db.transaction(tx => {
            const concurrent = tx
              .select()
              .from(aggregateCommandChainDrizzleSchemas.commands)
              .where(
                eq(
                  aggregateCommandChainDrizzleSchemas.commands.commandId,
                  command.id,
                ),
              )
              .get();
            if (concurrent !== undefined) {
              if (concurrent.canonicalBytes !== canonicalBytes) {
                throw new ZerospinError({
                  code: 'aggregate-command-chain-command-conflict',
                  message: `Aggregate command ${command.id} differs from its retained bytes`,
                });
              }
              return concurrent;
            }
            const previous = tx
              .select({
                aggregateIndex:
                  aggregateCommandChainDrizzleSchemas.commands.aggregateIndex,
              })
              .from(aggregateCommandChainDrizzleSchemas.commands)
              .orderBy(
                desc(
                  aggregateCommandChainDrizzleSchemas.commands.aggregateIndex,
                ),
              )
              .limit(1)
              .get();
            const aggregateIndex = (previous?.aggregateIndex ?? 0) + 1;
            tx.insert(aggregateCommandChainDrizzleSchemas.commands)
              .values({
                aggregateIndex,
                serviceIndex: null,
                commandId: command.id,
                canonicalBytes,
                chainedAt,
                command: canonicalBytes,
                result: null,
                materializedAggregateRepoName,
              })
              .run();
            const admitted = tx
              .select()
              .from(aggregateCommandChainDrizzleSchemas.commands)
              .where(
                eq(
                  aggregateCommandChainDrizzleSchemas.commands.aggregateIndex,
                  aggregateIndex,
                ),
              )
              .get();
            if (admitted === undefined) {
              throw new ZerospinError({
                code: 'aggregate-command-chain-admission-missing',
                message: `Aggregate command ${command.id} was not retained after admission`,
              });
            }
            return admitted;
          }),
        catch: cause =>
          ZerospinError.isZerospinError(cause)
            ? cause
            : new ZerospinError({
                code: 'aggregate-command-chain-admission-failed',
                message: `Failed to admit aggregate command ${command.id}`,
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
      });
      return db
        .select()
        .from(aggregateCommandChainDrizzleSchemas.commands)
        .where(
          eq(
            aggregateCommandChainDrizzleSchemas.commands.commandId,
            command.id,
          ),
        )
        .get();
    }),
  );
  if (row === undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-command-chain-admission-missing',
      message: `Aggregate command ${command.id} was not retained after admission`,
    });
  }
  yield* Effect.promise(() => props.storage.setAlarm(Date.now()));
  yield* runScheduledWork({
    db,
    deliveryQueue: props.deliveryQueue,
    materializedAggregateFrontendRepos:
      props.materializedAggregateFrontendRepos,
    materializedAggregateRepos: props.materializedAggregateRepos,
    storage: props.storage,
  });

  const settled = db
    .select()
    .from(aggregateCommandChainDrizzleSchemas.commands)
    .where(
      eq(aggregateCommandChainDrizzleSchemas.commands.commandId, command.id),
    )
    .get();
  if (settled?.result !== null && settled?.result !== undefined) {
    return yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(AggregateChainedCommandSchema),
    )(settled.result).pipe(
      mapParseError({
        code: 'aggregate-command-chain-retained-result-invalid',
        prefix: `Failed to decode aggregate command result ${command.id}`,
      }),
    );
  }
  return yield* new ZerospinError({
    code: 'aggregate-command-chain-terminal-result-missing',
    message: `Aggregate command ${command.id} remains pending after scheduled execution`,
  });
});
