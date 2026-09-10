import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { AggregateChainDb } from '../aggregateChainDbConfig.js';

import { admitCommandsTx } from './admitCommandsTx.js';

/** Admission freezes the complete input occurrence; each VAR owns its preparation. */
/*
 * AggregateChain durably orders complete aggregate inputs and returns
 * admission receipts. One batch commits atomically; retries recover retained
 * receipts, while version-owned materializers perform preparation and execution.
 *
 * 1. Process the submitted inputs in order, returning an empty batch immediately.
 * 2. Check the bound aggregate identity for every input.
 * 3. Encode every full input occurrence before opening the transaction.
 * 4. Recover duplicates, allocate positions, and retain the complete batch atomically.
 * 5. Classify admission failures.
 */
export const admitCommands = Effect.fn('AggregateChain.admitCommands')(
  function* (props: {
    commands: readonly IEncodedCommand<IAggregateCommand>[];
    db: IDb;
    key: { systemId: string; aggregateId: string; aggregateName: string };
  }) {
    const { db, key } = props;

    // 1 — an empty batch needs no transaction
    if (props.commands.length === 0) return [];

    const preparedCommands = yield* Effect.forEach(props.commands, command =>
      Effect.gen(function* () {
        // 2 — reject aggregateId or aggregateName mismatches
        if (
          command.aggregateId !== key.aggregateId ||
          command.aggregateName !== key.aggregateName
        ) {
          return yield* new ZerospinError({
            code: 'aggregate-chain-target-mismatch',
            message: 'Command does not match the bound aggregate',
          });
        }

        // 3 — preserve excess fields while validating EncodedAggregateCommandSchema
        const bytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(EncodedAggregateCommandSchema),
        )(command, { onExcessProperty: 'preserve' }).pipe(
          mapParseError({
            code: 'aggregate-chain-command-invalid',
            prefix: 'Invalid aggregate input',
          }),
        );
        return { command, bytes };
      }),
    );

    // 4 — commit the complete batch, including duplicate/conflict checks
    return yield* admitCommandsTx(preparedCommands).pipe(
      Effect.provideService(AggregateChainDb, db),
      // 5 — preserve domain failures and the public admission infrastructure code
      Effect.catch(error =>
        error.code === 'drizzle-transaction-failed'
          ? Effect.fail(
              new ZerospinError({
                code: 'aggregate-admission-failed',
                message: 'Failed to retain command',
                cause: ZerospinError.prettyUnknownFailure(error),
              }),
            )
          : Effect.fail(error),
      ),
    );
  },
);
