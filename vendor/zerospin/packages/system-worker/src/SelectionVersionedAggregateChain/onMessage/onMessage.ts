import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { SessionCommandSchema } from '@zerospin/core/session/AggregateSelectedCommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import {
  makeSpanLinkId,
  makeTelemetryCollector,
  makeTelemetryLayer,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';
import { isEqual } from 'es-toolkit';
import type { Connection, WSMessage } from 'partyserver';

import { AggregateChain } from '../../AggregateChain/AggregateChain.js';
import { genesisSelectionHash } from '../../selectionDispositionHash/selectionDispositionHash.js';
import { SystemLogRepo } from '../../SystemLogRepo/SystemLogRepo.js';
import { getSelectedCommands } from '../getSelectedCommands/getSelectedCommands.js';
import { selectionVersionedAggregateChainDbConfig } from '../selectionVersionedAggregateChainDbConfig.js';

/*
 * The aggregate frontend log validates resume, then admits complete commands over
 * its live socket and returns linked receipts without blocking selected delivery.
 * It handles the one initial resume message by
 * validating the saved selection checkpoint, then replaying its retained
 * suffix before marking the connection live. Invalid state, an unavailable
 * cursor, or a mismatched hash requests a fresh snapshot and closes the socket.
 *
 * 1. Read the retained connection admission.
 * 2. Define snapshot-required termination.
 * 3. Require the admitted awaiting-resume state.
 * 4. Decode the nonnegative resume cursor and selection hash.
 * 5. Validate the retained hash at that exact cursor.
 * 6. Enter replay mode.
 * 7. Replay contiguous retained pages.
 * 8. Complete replay and enable live delivery.
 */
export const onMessage = Effect.fn(
  'SelectionVersionedAggregateChain.onMessage',
)(function* (props: {
  connection: Connection<{
    phase: 'awaiting-resume' | 'replaying' | 'live';
    admissionCommandId?: string | null;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: string;
    selectionPath: string;
    authentication: Readonly<Record<string, unknown>>;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  }>;
  message: WSMessage;
  db: IDb;
  key: {
    aggregateVersion: string;
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    selectionPath: string;
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
    state.selectionPath !== key.selectionPath ||
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
          command: Schema.toEncoded(SessionCommandSchema),
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
          result: yield* encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'aggregate-version-unavailable',
                message:
                  'The requested version is not available through this capability',
              }),
            ),
          ),
          link: null,
        };
      }

      // 3 — compare aggregateId, aggregateName, authentication, frontendName, systemName, pushIndex, and delta
      if (
        command.aggregateId !== state.aggregateId ||
        command.aggregateName !== state.aggregateName ||
        !isEqual(command.authentication, state.authentication) ||
        command.frontendName !== state.frontendName ||
        command.systemName !== state.aggregateFrontendLock.systemName ||
        command.pushIndex !== null ||
        command.delta === null
      ) {
        return {
          result: yield* encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'aggregate-frontend-command-target-mismatch',
                message:
                  'Pushed command must be a terminal committed occurrence matching the admitted aggregate frontend',
              }),
            ),
          ),
          link: null,
        };
      }

      const selectedContract =
        state.aggregateFrontendLock.contracts[command.commandName];
      if (
        selectedContract === undefined ||
        selectedContract.commandName !== command.commandName ||
        selectedContract.version !== command.contractVersion
      ) {
        return {
          result: yield* encodeRpc(
            Effect.fail(
              new ZerospinError({
                code: 'aggregate-frontend-command-contract-unavailable',
                message:
                  'Command is not selected by the admitted frontend lock',
              }),
            ),
          ),
          link: null,
        };
      }

      // 4 — bind systemId, aggregateId, and aggregateName from the capability
      const chain = yield* AggregateChain.getRepo({
        key: {
          systemId: key.systemId,
          aggregateId: state.aggregateId,
          aggregateName: state.aggregateName,
        },
      });

      // 5 — submit the full occurrence and require the first admission receipt
      const collector = makeTelemetryCollector();
      const settled = yield* makeAsync(() =>
        chain.admitCommands({ commands: [command] }),
      ).pipe(
        Effect.flatMap(decodeRpc),
        Effect.flatMap(receipts =>
          receipts[0] === undefined
            ? Effect.fail(
                new ZerospinError({
                  code: 'aggregate-admission-receipt-missing',
                  message: 'Admission returned no receipt',
                }),
              )
            : Effect.succeed(receipts[0]),
        ),
        Effect.withSpan('SelectionVersionedAggregateChain.admitCommand', {
          root: true,
        }),
        Effect.provide(makeTelemetryLayer(collector)),
        Effect.result,
      );

      // 6 — preserve success or typed failure before attempting telemetry persistence
      const result = yield* Result.match(settled, {
        onFailure: error => encodeRpc(Effect.fail(error)),
        onSuccess: value => encodeRpc(Effect.succeed(value)),
      });

      // 7 — emit a link only after persistence succeeds and the root span matches this method
      const batch = collector.flush();
      const persisted = yield* Effect.gen(function* () {
        const systemLogRepo = yield* SystemLogRepo.getRepo({
          key: { systemId: key.systemId },
        });
        return yield* makeAsync<IEncodedResult<void, IAnyErrorJson>>(() =>
          systemLogRepo.appendTelemetryBatch({ batch }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(Effect.result);
      const rootSpan = batch.spans.at(-1);
      const link: ISpanLinkRecord | null =
        Result.isSuccess(persisted) &&
        decoded.success.traceContext != null &&
        rootSpan !== undefined &&
        rootSpan.parentSpanId === null &&
        rootSpan.name === 'SelectionVersionedAggregateChain.admitCommand'
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
          return { result: yield* encodeRpc(Effect.fail(error)), link: null };
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
            ...envelope,
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
        selectionIndex: Schema.Number.check(
          Schema.isInt(),
          Schema.isGreaterThanOrEqualTo(0),
        ),
        selectionHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
      }),
    ),
  )(message, { onExcessProperty: 'error' }).pipe(Effect.result);
  if (Result.isFailure(decodedResume)) {
    stateRequired();
    return;
  }

  // 5 — compare the retained hash at the exact resume cursor
  const resumeSelectionIndex = decodedResume.success.selectionIndex;
  const resumeSelectionHash = decodedResume.success.selectionHash;
  if (resumeSelectionIndex === 0) {
    if (resumeSelectionHash !== genesisSelectionHash()) {
      stateRequired();
      return;
    }
  } else {
    const checkpoint = db
      .select({
        selectionHash:
          selectionVersionedAggregateChainDbConfig.schema.commands
            .selectionHash,
      })
      .from(selectionVersionedAggregateChainDbConfig.schema.commands)
      .where(
        eq(
          selectionVersionedAggregateChainDbConfig.schema.commands
            .selectionIndex,
          resumeSelectionIndex,
        ),
      )
      .get();
    if (
      checkpoint === undefined ||
      checkpoint.selectionHash !== resumeSelectionHash
    ) {
      stateRequired();
      return;
    }
  }

  // 6 — keep the admitted target while replaying retained output
  connection.setState({ ...state, phase: 'replaying' });

  // 7 — reject a cursor beyond the tip and advance only after each send
  let deliveredThroughSelectionIndex = resumeSelectionIndex;
  for (;;) {
    const page = yield* getSelectedCommands({
      afterSelectionIndex: deliveredThroughSelectionIndex,
      db,
      frontend: {
        name: state.frontendName,
        authentication: state.authentication,
        lock: state.aggregateFrontendLock,
      },
    });
    if (page.tip < deliveredThroughSelectionIndex) {
      stateRequired();
      return;
    }
    for (const command of page.commands) {
      if (command.selectionIndex !== deliveredThroughSelectionIndex + 1) {
        stateRequired();
        return;
      }
      yield* Effect.try({
        try: () =>
          connection.send(
            JSON.stringify({
              type: 'aggregateSelectedCommand',
              command,
            }),
          ),
        catch: ZerospinError.catch({
          code: 'aggregate-frontend-command-send-failed',
          message: 'Failed to replay an aggregate frontend command',
        }),
      });
      deliveredThroughSelectionIndex = command.selectionIndex;
    }
    if (deliveredThroughSelectionIndex === page.tip) break;
    if (page.commands.length === 0) {
      stateRequired();
      return;
    }
  }

  // 8 — send the final selectionIndex then set phase live
  connection.send(
    JSON.stringify({
      type: 'replay-complete',
      selectionIndex: deliveredThroughSelectionIndex,
    }),
  );
  connection.setState({ ...state, phase: 'live' });
});
