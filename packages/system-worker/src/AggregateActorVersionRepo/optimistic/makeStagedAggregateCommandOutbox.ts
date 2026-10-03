import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { StagedAggregateCommandSchema } from '@zerospin/core/contracts/StagedAggregateCommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { encodeError, makeZerospinError, mapParseError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { AggregateChain } from '../../AggregateChain/AggregateChain.js';
import type { IAlarmRegistry } from '../../makeAlarmRegistry/makeAlarmRegistry.js';
import { makeOutboxQueue } from '../../makeOutboxQueue/makeOutboxQueue.js';
import { aggregateActorVersionRepoDbConfig } from '../aggregateActorVersionRepoDbConfig.js';

const terminalAdmissionCodes = new Set([
  'admission-contract-not-found',
  'aggregate-chain-command-invalid',
  'aggregate-chain-target-mismatch',
  'command-actor-required',
  'command-claims-unsupported',
  'node-admission-identity-mismatch',
  'node-admission-index-mismatch',
]);

/** Submit already staged commands through authoritative admission. */
export const makeStagedAggregateCommandOutbox = (props: {
  db: IDb;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: string;
    actorName: string;
    actorVersion: string;
    actorPath: string;
  };
  alarmRegistry: IAlarmRegistry;
}): Pick<ReturnType<typeof makeOutboxQueue>, 'drainAfter' | 'drain'> => {
  const { db, key, alarmRegistry } = props;
  return makeOutboxQueue({
    indexColumnName: 'stageIndex',
    name: 'stagedAggregateCommandOutbox',
    db,
    outboxTable:
      aggregateActorVersionRepoDbConfig.schema.stagedAggregateCommandOutbox,
    alarmRegistry,

    pageSize: 1,
    deliver: rows =>
      Effect.gen(function* () {
        for (const stored of rows) {
          const stage =
            yield* aggregateActorVersionRepoDbConfig.tables.stagedAggregateCommandOutbox
              .decodeRow(stored)
              .pipe(
                mapParseError({
                  code: 'saved-actor-command-invalid',
                  prefix: 'Invalid staged actor command row',
                }),
              );
          const commandRowId = yield* Schema.decodeUnknownEffect(
            makeAbbreviationIdSchema('row'),
          )(stage.commandRowId).pipe(
            mapParseError({
              code: 'saved-actor-command-invalid',
              prefix: 'Invalid retained row id',
            }),
          );
          const chain = yield* AggregateChain.getRepo({ key });
          const saved = db
            .select()
            .from(aggregateActorVersionRepoDbConfig.schema.commands)
            .where(
              eq(
                aggregateActorVersionRepoDbConfig.schema.commands.rowId,
                commandRowId,
              ),
            )
            .get();
          if (saved === undefined) {
            return yield* makeZerospinError('saved-actor-command-missing');
          }
          const staged = yield* Schema.decodeUnknownEffect(
            Schema.toType(StagedAggregateCommandSchema),
          )(stage).pipe(
            mapParseError({
              code: 'saved-actor-command-invalid',
              prefix: 'Invalid staged aggregate command',
            }),
          );
          const command = yield* Schema.decodeUnknownEffect(
            Schema.toType(EncodedAggregateCommandSchema),
          )(staged).pipe(
            mapParseError({
              code: 'saved-actor-command-invalid',
              prefix: 'Invalid staged command input',
            }),
          );
          const startedAt = new Date();
          const receipt = yield* makeAsync<
            Awaited<ReturnType<AggregateChain['admitCommands']>>
          >(() =>
            chain.admitCommands({
              aggregateVersion: key.aggregateVersion,
              commands: [command],
            }),
          ).pipe(
            Effect.flatMap(readRpcEnvelope),
            Effect.flatMap(admittedCommands =>
              admittedCommands[0] === undefined
                ? Effect.fail(
                    makeZerospinError('aggregate-admission-receipt-missing'),
                  )
                : Effect.succeed(admittedCommands[0]),
            ),
            Effect.catchIf(
              error =>
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                typeof error.code === 'string' &&
                terminalAdmissionCodes.has(error.code),
              error =>
                Effect.gen(function* () {
                  return {
                    aggregateIndex: null,
                    admission: {
                      status: 'failed' as const,
                      startedAt,
                      completedAt: new Date(),
                      failure: yield* encodeError(error),
                    },
                  };
                }),
            ),
          );
          const admission = yield* Schema.encodeEffect(
            Schema.Struct({
              admission:
                aggregateActorVersionRepoDbConfig.tables.commands.codec.fields
                  .admission,
            }),
          )({ admission: receipt.admission }).pipe(
            mapParseError({
              code: 'saved-admission-result-invalid',
              prefix: 'Invalid saved admission result',
            }),
          );
          db.transaction(tx => {
            tx.update(aggregateActorVersionRepoDbConfig.schema.commands)
              .set({
                ...admission,
                aggregateIndex: receipt.aggregateIndex,
              })
              .where(
                eq(
                  aggregateActorVersionRepoDbConfig.schema.commands.rowId,
                  commandRowId,
                ),
              )
              .run();
            if (receipt.admission.status === 'failed') {
              tx.update(aggregateActorVersionRepoDbConfig.schema.stagedCommands)
                .set({ resolvedAt: new Date() })
                .where(
                  eq(
                    aggregateActorVersionRepoDbConfig.schema.stagedCommands
                      .stageIndex,
                    stage.stageIndex,
                  ),
                )
                .run();
            }
          });
        }
      }),
  });
};
