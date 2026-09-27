import { createHref } from '@remix-run/route-pattern/href';
import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { getCommandContracts } from '@zerospin/core/automation/getCommandContracts';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { AggregateActorVersionRepo } from '../../AggregateActorVersionRepo/AggregateActorVersionRepo.js';
import { checkAdmission } from '../../checkAdmission.js';
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
    automationOutput?: boolean;
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
          command.automationName != null &&
          (!props.automationOutput || command.nodeId !== null)
        ) {
          return yield* makeZerospinError('automation-authority-required');
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
          const actor = yield* resolveAggregateActorVersion(
            config.system.aggregates[key.aggregateName] ?? {},
            command,
          );
          if (command.identity.aggregateId !== command.aggregateId) {
            return yield* Effect.fail(
              makeZerospinError('aggregate-command-target-mismatch'),
            );
          }
          yield* checkAdmission({
            command,
            identity: command.identity,
            ...(command.automationName == null ? { actor } : {}),
            owners: [
              {
                contracts: Object.values(getCommandContracts(actor, command)),
                identity: {
                  identitySchema: actor.identity.actorSchema,
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

    // Admission used to activate actor subscriptions indirectly through guard
    // validation. Explicitly activate automation owners without asking them to
    // validate state or influencing the admission decision.
    for (const entry of preparedCommands) {
      const actor = yield* resolveAggregateActorVersion(
        config.system.aggregates[key.aggregateName] ?? {},
        entry.command,
      );
      if (Object.keys(actor.automations).length === 0) continue;
      const selection = yield* Schema.decodeUnknownEffect(
        actor.identity.actorSchema,
      )(entry.command.identity);
      const actorPath = createHref(
        actor.identity.pattern,
        yield* Schema.decodeUnknownEffect(
          Schema.Record(Schema.String, Schema.String),
        )(selection),
      );
      const repo = yield* AggregateActorVersionRepo.getRepo({
        key: {
          ...key,
          aggregateVersion: props.aggregateVersion,
          actorName: actor.name,
          actorVersion: actor.version,
          actorPath,
        },
      });
      yield* makeAsync<Awaited<ReturnType<AggregateActorVersionRepo['ready']>>>(
        () => repo.ready(),
      ).pipe(Effect.flatMap(readRpcEnvelope));
    }
    return preparedCommands;
  },
);

export const admitCommands = Effect.fn('AggregateChain.admitCommands')(
  function* (props: Parameters<typeof prepareAdmission>[0]) {
    const prepared = yield* prepareAdmission(props);
    return yield* admitCommandsTx(props.db, prepared);
  },
);
