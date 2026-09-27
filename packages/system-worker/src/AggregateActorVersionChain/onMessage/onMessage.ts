import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  catchZerospinError,
  encodeError,
  makeZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import {
  makeRpcEnvelope,
  makeSpanLinkId,
  type IRpcEnvelope,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Exit, Result, Schema } from 'effect';
import { isEqual } from 'es-toolkit';
import type { Connection, WSMessage } from 'partyserver';

import { AggregateActorVersionRepo } from '../../AggregateActorVersionRepo/AggregateActorVersionRepo.js';
import { genesisExecutedHash } from '../../executedDispositionHash/executedDispositionHash.js';
import { SystemLogRepo } from '../../SystemLogRepo/SystemLogRepo.js';
import { aggregateActorVersionChainDbConfig } from '../aggregateActorVersionChainDbConfig.js';
import { getActorCommands } from '../getActorCommands/getActorCommands.js';

/*
 * The aggregate definition log validates resume, then admits complete commands over
 * its live socket and returns linked receipts without blocking selected delivery.
 * It validates the initial resume checkpoint, then replays missing executions
 * and owned results in one ordered stream before marking the connection live.
 * Invalid state, an unavailable cursor, or a mismatched hash requests a fresh
 * snapshot and closes the socket.
 *
 * 1. Read the retained connection admission.
 * 2. Define snapshot-required termination.
 * 3. Require the admitted awaiting-resume state.
 * 4. Decode the nonnegative resume cursor and selection hash.
 * 5. Validate the retained hash at that exact cursor.
 * 6. Enter replay mode.
 * 7. Replay ordered pages with independent execution and node progress checks.
 * 8. Complete replay and enable live delivery.
 */
export const onMessage = Effect.fn('AggregateActorVersionChain.onMessage')(
  function* (props: {
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      nodeId?: string;
      admissionCommandId?: string | null;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
      actorName: string;
      actorVersion: string;
      actorPath: string;
      claims: Readonly<Record<string, unknown>>;
      sessionName: string;
      aggregateSessionLock: IAggregateSessionLock;
    }>;
    message: WSMessage;
    db: IDb;
    key: {
      aggregateVersion: string;
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      actorName: string;
      actorVersion: string;
      actorPath: string;
    };
  }): Effect.fn.Return<void, IAnyError, Async> {
    const { connection, db, key, message } = props;

    // 1 — capture the checked target and connection phase
    const state = connection.state;

    // 2 — send state-required and close with code 4003
    const stateRequired = () => {
      connection.send(JSON.stringify({ type: 'state-required' }));
      connection.close(4003, 'state-required');
    };

    // 3 — check target fields, phase, and a string message
    if (
      state === null ||
      state === undefined ||
      state.aggregateId !== key.aggregateId ||
      state.aggregateName !== key.aggregateName ||
      state.aggregateVersion !== key.aggregateVersion ||
      state.actorName !== key.actorName ||
      state.actorVersion !== key.actorVersion ||
      state.actorPath !== key.actorPath ||
      typeof message !== 'string'
    ) {
      stateRequired();
      return;
    }

    if (state.phase === 'live') {
      if (state.admissionCommandId != null) {
        connection.close(4003, 'aggregate-admission-already-pending');
        return;
      }
      const decoded = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(
          Schema.Struct({
            type: Schema.Literal('pushAggregateCommand'),
            command: Schema.Struct({
              ...EncodedAggregateCommandSchema.members[1].fields,
            }),
            traceContext: Schema.optional(
              Schema.NullOr(
                Schema.Struct({
                  traceId: Schema.TemplateLiteral(['trc_', Schema.String]),
                  parentSpanId: Schema.TemplateLiteral(['spn_', Schema.String]),
                }),
              ),
            ),
          }),
        ),
      )(message, { onExcessProperty: 'error' }).pipe(Effect.result);
      if (Result.isFailure(decoded)) {
        connection.close(4003, 'aggregate-admission-message-invalid');
        return;
      }
      if (
        connection.state?.phase !== 'live' ||
        connection.state.admissionCommandId != null ||
        connection.readyState !== 1
      ) {
        connection.close(4003, 'aggregate-admission-already-pending');
        return;
      }
      const command = decoded.success.command;
      connection.setState({ ...state, admissionCommandId: command.id });
      const envelope = yield* Effect.gen(function* () {
        if (
          !Object.hasOwn(
            config.system.aggregates[state.aggregateName] ?? {},
            state.aggregateVersion,
          )
        ) {
          return {
            result: yield* encodeError(
              makeZerospinError({
                code: 'aggregate-version-unavailable',
                message:
                  'The requested version is not available through this capability',
              }),
            ).pipe(
              Effect.map(failure => ({ _tag: 'Failure' as const, failure })),
            ),
            link: null,
          };
        }

        // 3 — compare aggregateId, aggregateName, claims, sessionName, nodeIndex, and stagedDelta
        if (
          command.aggregateId !== state.aggregateId ||
          command.aggregateName !== state.aggregateName ||
          command.actorName !== state.actorName ||
          command.actorVersion !== state.actorVersion ||
          !isEqual(command.claims, state.claims) ||
          command.sessionName !== state.sessionName ||
          command.nodeId !== state.nodeId
        ) {
          return {
            result: yield* encodeError(
              makeZerospinError({
                code: 'aggregate-session-command-target-mismatch',
                message:
                  'Pushed command must be a terminal committed occurrence matching the admitted aggregate definition',
              }),
            ).pipe(
              Effect.map(failure => ({ _tag: 'Failure' as const, failure })),
            ),
            link: null,
          };
        }

        const selectedContract =
          state.aggregateSessionLock.contracts[command.commandName];
        if (
          selectedContract === undefined ||
          selectedContract.commandName !== command.commandName ||
          selectedContract.version !== command.contractVersion
        ) {
          return {
            result: yield* encodeError(
              makeZerospinError({
                code: 'aggregate-session-command-contract-unavailable',
                message:
                  'Command is not selected by the admitted definition lock',
              }),
            ).pipe(
              Effect.map(failure => ({ _tag: 'Failure' as const, failure })),
            ),
            link: null,
          };
        }

        // 4 — stage in the bound actor before requesting chain admission
        const repo = yield* AggregateActorVersionRepo.getRepo({
          key: {
            ...key,
          },
        });

        // 5 — the durable actor outbox admits the saved occurrence in stage order
        const settled = yield* Effect.gen(function* () {
          const staged = yield* makeAsync<
            Awaited<ReturnType<AggregateActorVersionRepo['stageCommands']>>
          >(() =>
            repo.stageCommands({
              commands: [{ ...command, systemName: config.system.name }],
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          const result = staged[0];
          if (result === undefined || result.commandId !== command.id) {
            return yield* makeZerospinError('actor-staging-result-missing');
          }
          if (result.stagingFailure !== null) {
            return yield* makeZerospinError(result.stagingFailure);
          }
          return yield* makeAsync<
            Awaited<ReturnType<AggregateActorVersionRepo['getStagedAdmission']>>
          >(() => repo.getStagedAdmission({ commandId: command.id })).pipe(
            Effect.flatMap(readRpcEnvelope),
          );
        }).pipe(
          Effect.withSpan('AggregateActorVersionChain.admitCommand', {
            root: true,
          }),
          makeRpcEnvelope,
        );

        // 6 — preserve success or typed failure before attempting telemetry persistence
        const result = settled.result;

        // 7 — emit a link only after persistence succeeds and the root span matches this method
        const batch = settled.telemetry;
        const persisted = yield* Effect.gen(function* () {
          const systemLogRepo = yield* SystemLogRepo.getRepo({
            key: { systemId: key.systemId },
          });
          return yield* makeAsync<IRpcEnvelope<void, IZerospinErrorJson>>(() =>
            systemLogRepo.appendTelemetryBatch({ batch }),
          ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
        }).pipe(Effect.exit);
        const rootSpan = batch.spans.at(-1);
        const link: ISpanLinkRecord | null =
          Exit.isSuccess(persisted) &&
          decoded.success.traceContext != null &&
          rootSpan !== undefined &&
          rootSpan.parentSpanId === null &&
          rootSpan.name === 'AggregateActorVersionChain.admitCommand'
            ? {
                linkId: makeSpanLinkId(),
                traceId: rootSpan.traceId,
                spanId: rootSpan.spanId,
                priorTraceId: decoded.success.traceContext.traceId,
                priorSpanId: decoded.success.traceContext.parentSpanId,
                kind: 'causedBy',
              }
            : null;

        return { result, link };
      }).pipe(
        Effect.catch(error =>
          Effect.gen(function* () {
            return {
              result: yield* encodeError(error).pipe(
                Effect.map(failure => ({ _tag: 'Failure' as const, failure })),
              ),
              link: null,
            };
          }),
        ),
      );
      const currentState = yield* Effect.sync(() => connection.state);
      if (currentState?.admissionCommandId === command.id) {
        connection.setState({ ...currentState, admissionCommandId: null });
        if (connection.readyState === 1) {
          connection.send(
            JSON.stringify({
              type: 'aggregateCommandAdmission',
              commandId: command.id,
              result: envelope.result,
              link: envelope.link,
            }),
          );
        }
      }
      return;
    }
    if (state.phase !== 'awaiting-resume') {
      stateRequired();
      return;
    }

    // 4 — reject malformed or excess resume fields
    const decodedResume = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(
        Schema.Struct({
          nodeId: Schema.String,
          nodeIndex: Schema.Number.check(
            Schema.isInt(),
            Schema.isGreaterThanOrEqualTo(0),
          ),
          executedIndex: Schema.Number.check(
            Schema.isInt(),
            Schema.isGreaterThanOrEqualTo(0),
          ),
          executedHash: Schema.String.check(
            Schema.isPattern(/^[a-f0-9]{64}$/u),
          ),
        }),
      ),
    )(message, { onExcessProperty: 'error' }).pipe(Effect.result);
    if (Result.isFailure(decodedResume)) {
      stateRequired();
      return;
    }

    // 5 — compare the retained hash at the exact resume cursor
    const resumeExecutedIndex = decodedResume.success.executedIndex;
    const resumeExecutedHash = decodedResume.success.executedHash;
    if (resumeExecutedIndex === 0) {
      if (resumeExecutedHash !== genesisExecutedHash()) {
        stateRequired();
        return;
      }
    } else {
      const checkpoint = db
        .select({
          executedHash:
            aggregateActorVersionChainDbConfig.schema.commands.executedHash,
        })
        .from(aggregateActorVersionChainDbConfig.schema.commands)
        .where(
          eq(
            aggregateActorVersionChainDbConfig.schema.commands.executedIndex,
            resumeExecutedIndex,
          ),
        )
        .get();
      if (
        checkpoint === undefined ||
        checkpoint.executedHash !== resumeExecutedHash
      ) {
        stateRequired();
        return;
      }
    }

    // 6 — keep the admitted target while replaying retained output
    connection.setState({
      ...state,
      nodeId: decodedResume.success.nodeId,
      phase: 'replaying',
    });

    // 7 — replay one ordered union, advancing each cursor independently
    let outcomeIndex = decodedResume.success.nodeIndex;
    let deliveredThroughExecutedIndex = resumeExecutedIndex;
    for (;;) {
      const page = yield* getActorCommands({
        afterExecutedIndex: deliveredThroughExecutedIndex,
        nodeId: decodedResume.success.nodeId,
        afterNodeIndex: outcomeIndex,
        db,
        definition: {
          name: state.sessionName,
          claims: state.claims,
          lock: state.aggregateSessionLock,
        },
      });
      if (page.tip < deliveredThroughExecutedIndex) {
        stateRequired();
        return;
      }
      for (const command of page.commands) {
        const newExecution =
          command.executedIndex > deliveredThroughExecutedIndex;
        if (
          (newExecution &&
            command.executedIndex !== deliveredThroughExecutedIndex + 1) ||
          (command.nodeIndex !== null && command.nodeIndex !== outcomeIndex + 1)
        ) {
          stateRequired();
          return;
        }
        yield* Effect.try({
          try: () =>
            connection.send(
              JSON.stringify({ type: 'aggregateActorCommand', command }),
            ),
          catch: catchZerospinError({
            code: 'aggregate-session-command-send-failed',
            message: 'Failed to replay an aggregate definition command',
          }),
        });
        if (newExecution) deliveredThroughExecutedIndex = command.executedIndex;
        if (command.nodeIndex !== null) outcomeIndex = command.nodeIndex;
      }
      if (
        page.commands.length < 64 &&
        deliveredThroughExecutedIndex === page.tip
      )
        break;
      if (page.commands.length === 0) {
        stateRequired();
        return;
      }
    }

    // 8 — send the final executedIndex then set phase live
    connection.send(
      JSON.stringify({
        type: 'replay-complete',
        executedIndex: deliveredThroughExecutedIndex,
      }),
    );
    connection.setState({
      ...state,
      nodeId: decodedResume.success.nodeId,
      phase: 'live',
    });
  },
);
