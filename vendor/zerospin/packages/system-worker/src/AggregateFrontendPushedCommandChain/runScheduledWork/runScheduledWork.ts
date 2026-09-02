import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedAggregateCommandSchema,
  EncodedSessionCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import {
  AggregateFrontendPushedCommandSchema,
  SessionCommandSchema,
} from '@zerospin/core/session/AggregateFrontendCommandSchema';
import type { IAggregateFrontendPushedCommand } from '@zerospin/core/session/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { eq, isNull } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { aggregateFrontendPushedCommandChainDrizzleSchemas } from '../AggregateFrontendPushedCommandChainDbConfig.js';

export const runScheduledWork = Effect.fn(
  'AggregateFrontendPushedCommandChain.runScheduledWork',
)(function* (props: {
  aggregateCommandChains: Cloudflare.Env['AGGREGATE_COMMAND_CHAIN'];
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  materializedAggregateFrontendRepos: Cloudflare.Env['MATERIALIZED_AGGREGATE_FRONTEND_REPO'];
  storage: DurableObjectStorage;
}) {
  const deliveryQueue = props.deliveryQueue;
  const pendingCommands = {
    name: 'AggregateFrontendPushedCommandChain.pendingCommands',
    requested: true,
    drain: Effect.fn(
      'AggregateFrontendPushedCommandChain.pendingCommands.drain',
    )(function* () {
      while (true) {
        const halted = props.db
          .select()
          .from(aggregateFrontendPushedCommandChainDrizzleSchemas.chainState)
          .where(
            eq(
              aggregateFrontendPushedCommandChainDrizzleSchemas.chainState.id,
              1,
            ),
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
        const pending = props.db
          .select()
          .from(aggregateFrontendPushedCommandChainDrizzleSchemas.commands)
          .where(
            isNull(
              aggregateFrontendPushedCommandChainDrizzleSchemas.commands.result,
            ),
          )
          .orderBy(
            aggregateFrontendPushedCommandChainDrizzleSchemas.commands
              .pushIndex,
          )
          .limit(1)
          .get();
        if (pending === undefined) return;

        const sourceCommand = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(SessionCommandSchema),
        )(pending.command).pipe(
          mapParseError({
            code: 'aggregate-frontend-pushed-command-chain-source-invalid',
            prefix: `Failed to decode committed local command ${pending.pushIndex}`,
          }),
        );
        const executed = yield* makeAsync<
          IEncodedResult<
            IEncodedCommand<IAggregateFrontendPushedCommand>,
            IAnyErrorJson
          >,
          IAnyError
        >(
          () =>
            props.materializedAggregateFrontendRepos
              .getByName(pending.materializedAggregateFrontendRepoName)
              .executePushedCommand({
                command: sourceCommand,
                pushIndex: pending.pushIndex,
                chainedAt: pending.chainedAt,
              }),
          ZerospinError.catch({
            code: 'aggregate-frontend-pushed-command-chain-materializer-rpc-failed',
            message: `Materialized aggregate frontend execution failed for pushIndex ${pending.pushIndex}`,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.result);
        if (Result.isFailure(executed)) {
          if (executed.failure.code.includes('execution-in-doubt')) {
            props.db
              .insert(
                aggregateFrontendPushedCommandChainDrizzleSchemas.chainState,
              )
              .values({
                id: 1,
                haltedAt: new Date(),
                failure: ZerospinError.stringify(executed.failure),
              })
              .onConflictDoUpdate({
                target:
                  aggregateFrontendPushedCommandChainDrizzleSchemas.chainState
                    .id,
                set: {
                  haltedAt: new Date(),
                  failure: ZerospinError.stringify(executed.failure),
                },
              })
              .run();
          }
          return yield* executed.failure;
        }
        const terminal = executed.success;
        if (
          terminal.delta === null ||
          terminal.id !== pending.commandId ||
          terminal.pushIndex !== pending.pushIndex ||
          terminal.chainedAt.getTime() !== pending.chainedAt.getTime()
        ) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-pushed-command-chain-materializer-result-conflict',
            message: `MaterializedAggregateFrontendRepo returned another occurrence for pushIndex ${pending.pushIndex}`,
          });
        }
        const sourceBytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(EncodedSessionCommandSchema),
        )(sourceCommand, { onExcessProperty: 'ignore' }).pipe(
          mapParseError({
            code: 'aggregate-frontend-pushed-command-chain-source-encode-failed',
            prefix: `Failed to encode source command ${pending.pushIndex}`,
          }),
        );
        const returnedSourceBytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(EncodedSessionCommandSchema),
        )(
          { ...terminal, pushIndex: null },
          { onExcessProperty: 'ignore' },
        ).pipe(
          mapParseError({
            code: 'aggregate-frontend-pushed-command-chain-result-source-invalid',
            prefix: `Failed to encode materializer source ${pending.pushIndex}`,
          }),
        );
        if (sourceBytes !== returnedSourceBytes) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-pushed-command-chain-materializer-command-conflict',
            message: `MaterializedAggregateFrontendRepo changed source bytes for pushIndex ${pending.pushIndex}`,
          });
        }
        const resultBytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(AggregateFrontendPushedCommandSchema),
        )(terminal).pipe(
          mapParseError({
            code: 'aggregate-frontend-pushed-command-chain-result-encode-failed',
            prefix: `Failed to encode pushed result ${pending.pushIndex}`,
          }),
        );
        const aggregateCommand =
          terminal.failedAt === null
            ? yield* Schema.decodeUnknownEffect(
                Schema.toType(EncodedAggregateCommandSchema),
              )(terminal, { onExcessProperty: 'ignore' }).pipe(
                mapParseError({
                  code: 'aggregate-frontend-pushed-command-chain-forward-command-invalid',
                  prefix: `Failed to build aggregate command ${pending.pushIndex}`,
                }),
              )
            : null;
        const aggregateCommandBytes =
          aggregateCommand === null
            ? null
            : yield* Schema.encodeEffect(
                Schema.fromJsonString(EncodedAggregateCommandSchema),
              )(aggregateCommand).pipe(
                mapParseError({
                  code: 'aggregate-frontend-pushed-command-chain-forward-command-encode-failed',
                  prefix: `Failed to encode aggregate command ${pending.pushIndex}`,
                }),
              );

        yield* Effect.try({
          try: () =>
            props.db.transaction(tx => {
              const live = tx
                .select()
                .from(
                  aggregateFrontendPushedCommandChainDrizzleSchemas.commands,
                )
                .where(
                  eq(
                    aggregateFrontendPushedCommandChainDrizzleSchemas.commands
                      .pushIndex,
                    pending.pushIndex,
                  ),
                )
                .get();
              if (
                live === undefined ||
                live.canonicalBytes !== pending.canonicalBytes ||
                live.result !== null
              ) {
                throw new ZerospinError({
                  code: 'aggregate-frontend-pushed-command-chain-terminal-commit-conflict',
                  message: `Pushed command ${pending.pushIndex} changed before terminal commit`,
                });
              }
              tx.update(
                aggregateFrontendPushedCommandChainDrizzleSchemas.commands,
              )
                .set({ result: resultBytes })
                .where(
                  eq(
                    aggregateFrontendPushedCommandChainDrizzleSchemas.commands
                      .pushIndex,
                    pending.pushIndex,
                  ),
                )
                .run();
              if (aggregateCommand !== null && aggregateCommandBytes !== null) {
                tx.insert(
                  aggregateFrontendPushedCommandChainDrizzleSchemas.aggregateForwardOutbox,
                )
                  .values({
                    pushIndex: pending.pushIndex,
                    commandId: pending.commandId,
                    canonicalBytes: aggregateCommandBytes,
                    command: aggregateCommandBytes,
                    aggregateCommandChainName:
                      pending.aggregateCommandChainName,
                    forwardedAt: null,
                    failure: null,
                  })
                  .run();
              }
            }),
          catch: cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'aggregate-frontend-pushed-command-chain-terminal-commit-failed',
                  message: `Failed to retain pushed result ${pending.pushIndex}`,
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
        });
      }
    }),
    hasPending: () =>
      Effect.sync(
        () =>
          props.db
            .select({
              pushIndex:
                aggregateFrontendPushedCommandChainDrizzleSchemas.commands
                  .pushIndex,
            })
            .from(aggregateFrontendPushedCommandChainDrizzleSchemas.commands)
            .where(
              isNull(
                aggregateFrontendPushedCommandChainDrizzleSchemas.commands
                  .result,
              ),
            )
            .limit(1)
            .get() !== undefined,
      ),
  };

  const aggregateForwarding = {
    name: 'AggregateFrontendPushedCommandChain.aggregateForwarding',
    requested: true,
    drain: Effect.fn(
      'AggregateFrontendPushedCommandChain.aggregateForwarding.drain',
    )(function* () {
      const rows = props.db
        .select()
        .from(
          aggregateFrontendPushedCommandChainDrizzleSchemas.aggregateForwardOutbox,
        )
        .where(
          isNull(
            aggregateFrontendPushedCommandChainDrizzleSchemas
              .aggregateForwardOutbox.forwardedAt,
          ),
        )
        .orderBy(
          aggregateFrontendPushedCommandChainDrizzleSchemas
            .aggregateForwardOutbox.pushIndex,
        )
        .all();
      for (const row of rows) {
        const command = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(EncodedAggregateCommandSchema),
        )(row.command).pipe(
          mapParseError({
            code: 'aggregate-frontend-pushed-command-chain-forward-command-invalid',
            prefix: `Failed to decode aggregate forward ${row.pushIndex}`,
          }),
        );
        const forwarded = yield* makeAsync<
          IEncodedResult<void, IAnyErrorJson>,
          IAnyError
        >(
          () =>
            props.aggregateCommandChains
              .getByName(row.aggregateCommandChainName)
              .receivePushedCommand({ command }),
          ZerospinError.catch({
            code: 'aggregate-frontend-pushed-command-chain-forward-rpc-failed',
            message: `Failed to forward pushIndex ${row.pushIndex} to AggregateCommandChain`,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.result);
        props.db
          .update(
            aggregateFrontendPushedCommandChainDrizzleSchemas.aggregateForwardOutbox,
          )
          .set(
            Result.isSuccess(forwarded)
              ? { forwardedAt: new Date(), failure: null }
              : { failure: ZerospinError.stringify(forwarded.failure) },
          )
          .where(
            eq(
              aggregateFrontendPushedCommandChainDrizzleSchemas
                .aggregateForwardOutbox.pushIndex,
              row.pushIndex,
            ),
          )
          .run();
        if (Result.isFailure(forwarded)) return yield* forwarded.failure;
      }
    }),
    hasPending: () =>
      Effect.sync(
        () =>
          props.db
            .select({
              pushIndex:
                aggregateFrontendPushedCommandChainDrizzleSchemas
                  .aggregateForwardOutbox.pushIndex,
            })
            .from(
              aggregateFrontendPushedCommandChainDrizzleSchemas.aggregateForwardOutbox,
            )
            .where(
              isNull(
                aggregateFrontendPushedCommandChainDrizzleSchemas
                  .aggregateForwardOutbox.forwardedAt,
              ),
            )
            .limit(1)
            .get() !== undefined,
      ),
  };

  const drained = yield* deliveryQueue
    .drain({
      lanes: [pendingCommands, aggregateForwarding],
    })
    .pipe(
      Effect.tapError(() =>
        Effect.promise(() => props.storage.setAlarm(Date.now() + 1_000)),
      ),
    );
  yield* Effect.promise(() =>
    drained.pending
      ? props.storage.setAlarm(Date.now() + 1_000)
      : props.storage.deleteAlarm(),
  );
  return drained;
});
