import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { MachineClaimsSchema } from '@zerospin/core/machine/MachineClaimsSchema';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { checkAdmission } from '../../checkAdmission.js';
import { verifyMachineFrozenCommand } from '../../verifyMachineFrozenCommand.js';
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
    aggregateVersion: string;
    machineOutput?: boolean;
    machineMode?: 'push' | 'execute';
    db: IDb;
    key: { systemId: string; aggregateId: string; aggregateName: string };
  }) {
    const { db, key, commands } = props;

    // 1 — an empty batch needs no transaction
    if (commands.length === 0) return [];

    const checked = new Set<string>();
    const preparedCommands = yield* Effect.forEach(commands, command =>
      Effect.gen(function* () {
        const startedAt = new Date();
        if (
          command.actorName === '__machine' &&
          (!props.machineOutput || command.nodeId !== null)
        ) {
          return yield* makeZerospinError('machine-authority-required');
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
        if (!duplicate) {
          if (command.actorName === '__machine') {
            const claims = yield* Schema.decodeUnknownEffect(
              MachineClaimsSchema,
              {
                onExcessProperty: 'error',
              },
            )(command.claims);
            if (
              claims.aggregateId !== key.aggregateId ||
              props.machineMode === undefined
            ) {
              return yield* makeZerospinError('machine-contract-forbidden');
            }
            yield* verifyMachineFrozenCommand({
              command,
              mode: props.machineMode,
              bindingName: claims.bindingName,
              systemId: key.systemId,
              machineName: claims.machineName,
            });
            const contract =
              config.system.aggregates[key.aggregateName]?.[
                props.aggregateVersion
              ]?.contracts[command.commandName];
            if (contract === undefined) {
              return yield* makeZerospinError('machine-contract-forbidden');
            }
            yield* checkAdmission({
              command,
              claims: command.claims,
              owners: [
                {
                  contracts: [contract],
                  identity: { claimsSchema: MachineClaimsSchema },
                },
              ],
            });
            checked.add(command.id);
            return {
              command,
              admission: {
                status: 'succeeded' as const,
                startedAt,
                completedAt: new Date(),
              },
              duplicate: false,
            };
          }
          const actor = yield* resolveAggregateActorVersion(
            config.system.aggregates[key.aggregateName] ?? {},
            command,
          );
          if (command.claims.aggregateId !== command.aggregateId) {
            return yield* Effect.fail(
              makeZerospinError('aggregate-command-target-mismatch'),
            );
          }
          yield* checkAdmission({
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
        checked.add(command.id);
        return {
          command,
          admission:
            retained === undefined
              ? {
                  status: 'succeeded' as const,
                  startedAt,
                  completedAt: new Date(),
                }
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
