import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import type { Semaphore } from 'effect/Semaphore';

import { MaterializedAggregateRepo } from '../../MaterializedAggregateRepo/MaterializedAggregateRepo.js';
import { aggregateCommandChainDrizzleSchemas } from '../AggregateCommandChainDbConfig.js';

export const receivePushedCommand = Effect.fn(
  'AggregateCommandChain.receivePushedCommand',
)(function* (props: {
  admissionSemaphore: Semaphore;
  command: IEncodedCommand<IAggregateCommand>;
  db: IDb;
  key: { systemId: string; aggregateId: string; aggregateName: string };
  storage: Pick<DurableObjectStorage, 'setAlarm'>;
}) {
  const { command, db, key } = props;
  if (
    command.aggregateId !== key.aggregateId ||
    command.aggregateName !== key.aggregateName
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-command-chain-pushed-target-mismatch',
      message:
        'Pushed aggregate command does not match its bound AggregateCommandChain',
    });
  }
  if (
    command.pushIndex === null ||
    command.sessionId === null ||
    command.userId === null ||
    command.frontendName === null
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-command-chain-pushed-provenance-missing',
      message: 'Pushed aggregate command must retain its complete provenance',
    });
  }

  const canonicalBytes = yield* Schema.encodeEffect(
    Schema.fromJsonString(EncodedAggregateCommandSchema),
  )(command).pipe(
    mapParseError({
      code: 'aggregate-command-chain-pushed-command-encode-failed',
      prefix: `Failed to encode pushed aggregate command ${command.id}`,
    }),
  );

  yield* props.admissionSemaphore.withPermits(1)(
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
        if (
          retained.canonicalBytes !== canonicalBytes ||
          retained.serviceIndex !== null
        ) {
          return yield* new ZerospinError({
            code: 'aggregate-command-chain-pushed-command-conflict',
            message: `Pushed aggregate command ${command.id} differs from its retained admission`,
          });
        }
        return;
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

      const materializedAggregateRepoName =
        yield* MaterializedAggregateRepo.fixedDORepoConfig.nameUtils.makeName(
          key,
        );
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
              if (
                concurrent.canonicalBytes !== canonicalBytes ||
                concurrent.serviceIndex !== null
              ) {
                throw new ZerospinError({
                  code: 'aggregate-command-chain-pushed-command-conflict',
                  message: `Pushed aggregate command ${command.id} differs from its retained admission`,
                });
              }
              return;
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
            tx.insert(aggregateCommandChainDrizzleSchemas.commands)
              .values({
                aggregateIndex: (previous?.aggregateIndex ?? 0) + 1,
                serviceIndex: null,
                commandId: command.id,
                canonicalBytes,
                chainedAt: new Date(),
                command: canonicalBytes,
                result: null,
                materializedAggregateRepoName,
              })
              .run();
          }),
        catch: cause =>
          ZerospinError.isZerospinError(cause)
            ? cause
            : new ZerospinError({
                code: 'aggregate-command-chain-pushed-admission-failed',
                message: `Failed to admit pushed aggregate command ${command.id}`,
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
      });
    }),
  );
  yield* Effect.promise(() => props.storage.setAlarm(Date.now()));
});
