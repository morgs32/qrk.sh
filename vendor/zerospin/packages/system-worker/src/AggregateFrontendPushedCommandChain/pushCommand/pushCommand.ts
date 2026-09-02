import type {
  IChainedCommand,
  IEncodedCommand,
  ISessionCommand,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import {
  AggregateFrontendPushedCommandSchema,
  SessionCommandSchema,
} from '@zerospin/core/session/AggregateFrontendCommandSchema';
import type { IFrontendDelta } from '@zerospin/core/session/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import type { Semaphore } from 'effect/Semaphore';

import { AggregateCommandChain } from '../../AggregateCommandChain/AggregateCommandChain.js';
import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { MaterializedAggregateFrontendRepo } from '../../MaterializedAggregateFrontendRepo/MaterializedAggregateFrontendRepo.js';
import { aggregateFrontendPushedCommandChainDrizzleSchemas } from '../AggregateFrontendPushedCommandChainDbConfig.js';
import { runScheduledWork } from '../runScheduledWork/runScheduledWork.js';

export const pushCommand = Effect.fn(
  'AggregateFrontendPushedCommandChain.pushCommand',
)(function* (props: {
  admissionSemaphore: Semaphore;
  aggregateCommandChains: Cloudflare.Env['AGGREGATE_COMMAND_CHAIN'];
  command: IEncodedCommand<
    IChainedCommand<ISessionCommand, IFrontendDelta> &
      Readonly<{ sessionIndex: number; pushIndex: null }>
  >;
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
  materializedAggregateFrontendRepos: Cloudflare.Env['MATERIALIZED_AGGREGATE_FRONTEND_REPO'];
  storage: DurableObjectStorage;
}) {
  const { command, db, key } = props;
  if (
    command.aggregateId !== key.aggregateId ||
    command.aggregateName !== key.aggregateName ||
    command.userId !== key.userId ||
    command.frontendName !== key.frontendName ||
    command.pushIndex !== null ||
    command.delta === null
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-pushed-command-chain-target-mismatch',
      message:
        'Committed local command does not match its bound AggregateFrontendPushedCommandChain',
    });
  }
  const halted = db
    .select()
    .from(aggregateFrontendPushedCommandChainDrizzleSchemas.chainState)
    .where(
      eq(aggregateFrontendPushedCommandChainDrizzleSchemas.chainState.id, 1),
    )
    .get();
  if (halted?.haltedAt !== null && halted?.haltedAt !== undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-pushed-command-chain-halted',
      message:
        'AggregateFrontendPushedCommandChain is halted for execution repair',
      ...(halted.failure === null ? {} : { cause: halted.failure }),
    });
  }

  const canonicalBytes = yield* Schema.encodeEffect(
    Schema.fromJsonString(SessionCommandSchema),
  )(command).pipe(
    mapParseError({
      code: 'aggregate-frontend-pushed-command-chain-command-encode-failed',
      prefix: `Failed to encode committed local command ${command.id}`,
    }),
  );
  const row = yield* props.admissionSemaphore.withPermits(1)(
    Effect.gen(function* () {
      const retained = db
        .select()
        .from(aggregateFrontendPushedCommandChainDrizzleSchemas.commands)
        .where(
          eq(
            aggregateFrontendPushedCommandChainDrizzleSchemas.commands
              .commandId,
            command.id,
          ),
        )
        .get();
      if (retained !== undefined) {
        if (retained.canonicalBytes !== canonicalBytes) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-pushed-command-chain-command-conflict',
            message: `Committed local command ${command.id} differs from its retained bytes`,
          });
        }
        return retained;
      }

      const materializedAggregateFrontendRepoName =
        yield* MaterializedAggregateFrontendRepo.fixedDORepoConfig.nameUtils.makeName(
          key,
        );
      const aggregateCommandChainName =
        yield* AggregateCommandChain.fixedDORepoConfig.nameUtils.makeName({
          systemId: key.systemId,
          aggregateId: key.aggregateId,
          aggregateName: key.aggregateName,
        });
      const chainedAt = new Date();
      yield* Effect.try({
        try: () =>
          db.transaction(tx => {
            const concurrent = tx
              .select()
              .from(aggregateFrontendPushedCommandChainDrizzleSchemas.commands)
              .where(
                eq(
                  aggregateFrontendPushedCommandChainDrizzleSchemas.commands
                    .commandId,
                  command.id,
                ),
              )
              .get();
            if (concurrent !== undefined) {
              if (concurrent.canonicalBytes !== canonicalBytes) {
                throw new ZerospinError({
                  code: 'aggregate-frontend-pushed-command-chain-command-conflict',
                  message: `Committed local command ${command.id} differs from its retained bytes`,
                });
              }
              return concurrent;
            }
            const previous = tx
              .select({
                pushIndex:
                  aggregateFrontendPushedCommandChainDrizzleSchemas.commands
                    .pushIndex,
              })
              .from(aggregateFrontendPushedCommandChainDrizzleSchemas.commands)
              .orderBy(
                desc(
                  aggregateFrontendPushedCommandChainDrizzleSchemas.commands
                    .pushIndex,
                ),
              )
              .limit(1)
              .get();
            const pushIndex = (previous?.pushIndex ?? 0) + 1;
            tx.insert(
              aggregateFrontendPushedCommandChainDrizzleSchemas.commands,
            )
              .values({
                pushIndex,
                commandId: command.id,
                canonicalBytes,
                command: canonicalBytes,
                chainedAt,
                result: null,
                materializedAggregateFrontendRepoName,
                aggregateCommandChainName,
              })
              .run();
            const admitted = tx
              .select()
              .from(aggregateFrontendPushedCommandChainDrizzleSchemas.commands)
              .where(
                eq(
                  aggregateFrontendPushedCommandChainDrizzleSchemas.commands
                    .pushIndex,
                  pushIndex,
                ),
              )
              .get();
            if (admitted === undefined) {
              throw new ZerospinError({
                code: 'aggregate-frontend-pushed-command-chain-admission-missing',
                message: `Pushed command ${command.id} was not retained after admission`,
              });
            }
            return admitted;
          }),
        catch: cause =>
          ZerospinError.isZerospinError(cause)
            ? cause
            : new ZerospinError({
                code: 'aggregate-frontend-pushed-command-chain-admission-failed',
                message: `Failed to admit pushed command ${command.id}`,
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
      });
      return db
        .select()
        .from(aggregateFrontendPushedCommandChainDrizzleSchemas.commands)
        .where(
          eq(
            aggregateFrontendPushedCommandChainDrizzleSchemas.commands
              .commandId,
            command.id,
          ),
        )
        .get();
    }),
  );
  if (row === undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-pushed-command-chain-admission-missing',
      message: `Pushed command ${command.id} was not retained after admission`,
    });
  }

  yield* Effect.promise(() => props.storage.setAlarm(Date.now()));
  yield* runScheduledWork({
    aggregateCommandChains: props.aggregateCommandChains,
    db,
    deliveryQueue: props.deliveryQueue,
    materializedAggregateFrontendRepos:
      props.materializedAggregateFrontendRepos,
    storage: props.storage,
  });
  const settled = db
    .select()
    .from(aggregateFrontendPushedCommandChainDrizzleSchemas.commands)
    .where(
      eq(
        aggregateFrontendPushedCommandChainDrizzleSchemas.commands.commandId,
        command.id,
      ),
    )
    .get();
  if (settled?.result !== null && settled?.result !== undefined) {
    return yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(AggregateFrontendPushedCommandSchema),
    )(settled.result).pipe(
      mapParseError({
        code: 'aggregate-frontend-pushed-command-chain-retained-result-invalid',
        prefix: `Failed to decode pushed command result ${command.id}`,
      }),
    );
  }
  return yield* new ZerospinError({
    code: 'aggregate-frontend-pushed-command-chain-terminal-result-missing',
    message: `Pushed command ${command.id} remains pending after scheduled execution`,
  });
});
