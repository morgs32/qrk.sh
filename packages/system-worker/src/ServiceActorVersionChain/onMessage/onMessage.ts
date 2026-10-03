import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { filterServiceActorOutput } from '@zerospin/core/serviceSession/filterServiceActorOutput';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import {
  catchZerospinError,
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';
import type { Connection, WSMessage } from 'partyserver';

import { genesisDispositionHash } from '../../serviceDispositionHash/serviceDispositionHash.js';
import { getActorOutputs } from '../getActorOutputs/getActorOutputs.js';
import { getNodeOutcomes } from '../getNodeOutcomes.js';
import { serviceActorVersionChainDbConfig } from '../serviceActorVersionChainDbConfig.js';

import { pushServiceCommand } from './pushServiceCommand.js';

/*
 * The service definition log handles the one initial resume message by
 * validating the saved service checkpoint, then replaying its retained
 * suffix before marking the connection live. Invalid state, an unavailable
 * cursor, or a mismatched hash requests a fresh snapshot and closes the socket.
 *
 * 1. Read the retained connection admission.
 * 2. Define snapshot-required termination.
 * 3. Require the admitted awaiting-resume state.
 * 4. Decode the nonnegative resume cursor and service hash.
 * 5. Validate the retained hash at that exact cursor.
 * 6. Enter replay mode.
 * 7. Replay contiguous retained pages.
 * 8. Complete replay and enable live delivery.
 */
export const onMessage = Effect.fn('ServiceActorVersionChain.onMessage')(
  function* (props: {
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      nodeId?: string | null;
      serviceName: string;
      serviceVersion: string;
      actorPath: string;
      claims: Readonly<Record<string, unknown>>;
      sessionName: string;
      serviceSessionLock: IServiceSessionLock;
    }>;
    message: WSMessage;
    db: IDb;
    key: {
      systemId: string;
      serviceName: string;
      serviceVersion: string;
      actorPath: string;
      actorName: string;
      actorVersion: string;
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

    if (state?.phase === 'live' && typeof message === 'string') {
      const incoming = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(
          Schema.Struct({
            type: Schema.Literal('pushServiceCommand'),
            command: Schema.Unknown,
          }),
        ),
      )(message, { onExcessProperty: 'error' }).pipe(Effect.result);
      if (Result.isSuccess(incoming)) {
        yield* pushServiceCommand({
          ...props,
          input: incoming.success.command,
        });
        return;
      }
    }
    // 3 — check target fields, phase, and a string message
    if (
      state === null ||
      state === undefined ||
      state.serviceVersion !== key.serviceVersion ||
      state.serviceName !== key.serviceName ||
      state.actorPath !== key.actorPath ||
      state.serviceSessionLock.actorName !== key.actorName ||
      state.serviceSessionLock.actorVersion !== key.actorVersion ||
      state.phase !== 'awaiting-resume' ||
      typeof message !== 'string'
    ) {
      stateRequired();
      return;
    }

    // 4 — reject malformed or excess resume fields
    const decodedResume = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(
        Schema.Struct({
          nodeId: Schema.NullOr(Schema.NonEmptyString),
          nodeIndex: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
          executedIndex: Schema.Number.check(
            Schema.isInt(),
            Schema.isGreaterThanOrEqualTo(0),
          ),
          serviceHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
        }),
      ),
    )(message, { onExcessProperty: 'error' }).pipe(Effect.result);
    if (Result.isFailure(decodedResume)) {
      stateRequired();
      return;
    }

    // 5 — compare the retained hash at the exact resume cursor
    const resumeExecutedIndex = decodedResume.success.executedIndex;
    const resumeServiceHash = decodedResume.success.serviceHash;
    if (resumeExecutedIndex === 0) {
      if (resumeServiceHash !== genesisDispositionHash()) {
        stateRequired();
        return;
      }
    } else {
      const checkpoint = db
        .select({
          serviceHash:
            serviceActorVersionChainDbConfig.schema.browserCommands.serviceHash,
        })
        .from(serviceActorVersionChainDbConfig.schema.browserCommands)
        .where(
          eq(
            serviceActorVersionChainDbConfig.schema.browserCommands
              .executedIndex,
            resumeExecutedIndex,
          ),
        )
        .get();
      if (
        checkpoint === undefined ||
        checkpoint.serviceHash !== resumeServiceHash
      ) {
        stateRequired();
        return;
      }
    }

    // 6 — keep the admitted target while replaying retained output
    const caller = { ...state, nodeId: decodedResume.success.nodeId };
    connection.setState({ ...caller, phase: 'replaying' });

    if (caller.nodeId !== null) {
      let afterNodeIndex = decodedResume.success.nodeIndex;
      for (;;) {
        const page = yield* getNodeOutcomes({
          db,
          nodeId: caller.nodeId,
          sessionName: caller.sessionName,
          claims: caller.claims,
          afterNodeIndex,
          throughExecutedIndex: resumeExecutedIndex,
          models: caller.serviceSessionLock.models,
        });
        for (const output of page.outputs) {
          connection.send(
            JSON.stringify({ type: 'serviceActorOutput', output }),
          );
        }
        afterNodeIndex = page.nodeThrough;
        if (afterNodeIndex >= page.resolvedThrough) {
          break;
        }
        if (page.outputs.length === 0) {
          stateRequired();
          return;
        }
      }
    }
    // 7 — reject a cursor beyond the tip and advance only after each send
    let deliveredThroughExecutedIndex = resumeExecutedIndex;
    for (;;) {
      const page = yield* getActorOutputs({
        afterExecutedIndex: deliveredThroughExecutedIndex,
        db,
      });
      if (page.tip < deliveredThroughExecutedIndex) {
        stateRequired();
        return;
      }
      for (const output of page.outputs) {
        if (output.executedIndex !== deliveredThroughExecutedIndex + 1) {
          stateRequired();
          return;
        }
        const retained = db
          .select()
          .from(serviceActorVersionChainDbConfig.schema.browserCommands)
          .where(
            eq(
              serviceActorVersionChainDbConfig.schema.browserCommands
                .executedIndex,
              output.executedIndex,
            ),
          )
          .get();
        if (retained === undefined) {
          return yield* makeZerospinError('session-output-missing');
        }
        const owner =
          (yield* serviceActorVersionChainDbConfig.tables.browserCommands
            .decodeRow(retained)
            .pipe(
              mapParseError({
                code: 'session-output-invalid',
                prefix: 'Invalid retained output owner',
              }),
            )).caller;
        yield* Effect.try({
          try: () =>
            connection.send(
              JSON.stringify({
                type: 'serviceActorOutput',
                output: filterServiceActorOutput(
                  output,
                  state.serviceSessionLock.models,
                  caller,
                  owner,
                ),
              }),
            ),
          catch: catchZerospinError({
            code: 'service-session-command-send-failed',
            message: 'Failed to replay an service definition command',
          }),
        });
        deliveredThroughExecutedIndex = output.executedIndex;
      }
      if (deliveredThroughExecutedIndex === page.tip) {
        break;
      }
      if (page.outputs.length === 0) {
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
    connection.setState({ ...caller, phase: 'live' });
  },
);
