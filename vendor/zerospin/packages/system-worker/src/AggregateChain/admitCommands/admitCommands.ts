import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { prepareAdmissionResult } from '../../checkAdmission.js';
import { aggregateChainDbConfig } from '../aggregateChainDbConfig.js';

import { admitCommandsTx } from './admitCommandsTx.js';
/** Admission freezes the complete input occurrence; each VAR owns its preparation. */
/*
 * AggregateChain durably orders complete aggregate inputs and returns
 * the retained commands. One batch commits atomically; a repeated id returns
 * the command already stored, while version-owned materializers perform
 * preparation and execution.
 *
 * 1. Process the submitted inputs in order, returning an empty batch immediately.
 * 2. Check the bound aggregate identity for every input.
 * 3. Validate every full input occurrence before opening the transaction.
 * 4. Recover duplicates, allocate aggregateIndex values, and retain the complete batch atomically.
 * 5. Classify admission failures.
 */
export const prepareAdmission = Effect.fn('AggregateChain.prepareAdmission')(
  function* (props: {
    commands: readonly IEncodedCommand<IAggregateCommand>[];
    trustedAsync?: true;
    aggregateVersion: string;
    db: IDb;
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
    };
  }) {
    const { db, key, commands, aggregateVersion } = props;
    // 1 — an empty batch needs no transaction
    if (commands.length === 0) {
      return [];
    }
    if (
      config.system.aggregates[key.aggregateName]?.[aggregateVersion] ===
      undefined
    ) {
      return yield* makeZerospinError(
        'aggregate-execution-version-unsupported',
      );
    }
    const checked = new Set<string>();
    const preparedCommands = yield* Effect.forEach(commands, command =>
      Effect.gen(function* () {
        const startedAt = new Date();
        if (command.response !== undefined && props.trustedAsync !== true) {
          return yield* makeZerospinError('public-async-command-forbidden');
        }
        // 2 — reject aggregateId or aggregateName mismatches
        if (
          command.aggregateId !== key.aggregateId ||
          command.aggregateName !== key.aggregateName
        ) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'aggregate-chain-target-mismatch',
              message: 'Command does not match the bound aggregate',
            }),
          );
        }
        // 3 — validate the declared aggregate input fields
        yield* Schema.encodeEffect(EncodedAggregateCommandSchema)(command).pipe(
          mapParseError({
            code: 'aggregate-chain-command-invalid',
            prefix: 'Invalid aggregate input',
          }),
        );
        const retained = db
          .select()
          .from(aggregateChainDbConfig.schema.commands)
          .where(eq(aggregateChainDbConfig.schema.commands.id, command.id))
          .get();
        const duplicate = retained !== undefined || checked.has(command.id);
        const admission = {
          status: 'succeeded' as const,
          startedAt,
          completedAt: new Date(),
        };
        let checkedAdmission: Effect.Success<
          ReturnType<typeof prepareAdmissionResult>
        > = admission;
        if (!duplicate) {
          const actor = yield* resolveAggregateActorVersion(
            config.system.aggregates[key.aggregateName] ?? {},
            command,
          );
          if (command.claims.aggregateId !== command.aggregateId) {
            return yield* Effect.fail(
              makeZerospinError('aggregate-command-target-mismatch'),
            );
          }
          if (props.trustedAsync !== true) {
            checkedAdmission = yield* prepareAdmissionResult({
              startedAt,
              command,
              claims: command.claims,
              actor,
              owners: [
                {
                  contracts: Object.values(actor.contracts),
                  identity: {
                    claimsSchema: actor.identity.identitySchema,
                  },
                },
              ],
            });
          }
        }
        checked.add(command.id);
        return {
          command,
          originalExecutionVersion:
            retained?.originalExecutionVersion ?? aggregateVersion,
          admission:
            retained === undefined
              ? checkedAdmission
              : (yield* aggregateChainDbConfig.tables.commands.decodeRow(
                  retained,
                )).admission,
          duplicate,
        };
      }),
    );
    return preparedCommands;
  },
);
export const admitCommands = Effect.fn('AggregateChain.admitCommands')(
  function* (props: Parameters<typeof prepareAdmission>[0]) {
    const prepared = yield* prepareAdmission(props);
    return yield* admitCommandsTx(props.db, prepared);
  },
);
