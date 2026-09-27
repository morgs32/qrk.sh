import type { IDb } from '@zerospin/core/drizzle/types';
import { filterServiceActorCommand } from '@zerospin/core/serviceSession/filterServiceActorCommand';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { catchZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';
import type { Connection, WSMessage } from 'partyserver';

import { genesisDispositionHash } from '../../serviceDispositionHash/serviceDispositionHash.js';
import { getActorCommands } from '../getActorCommands/getActorCommands.js';
import { serviceActorVersionChainDbConfig } from '../serviceActorVersionChainDbConfig.js';

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
  }): Effect.fn.Return<void, IAnyError> {
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
          serviceIndex: Schema.Number.check(
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
    const resumeServiceIndex = decodedResume.success.serviceIndex;
    const resumeServiceHash = decodedResume.success.serviceHash;
    if (resumeServiceIndex === 0) {
      if (resumeServiceHash !== genesisDispositionHash()) {
        stateRequired();
        return;
      }
    } else {
      const checkpoint = db
        .select({
          serviceHash:
            serviceActorVersionChainDbConfig.schema.commands.serviceHash,
        })
        .from(serviceActorVersionChainDbConfig.schema.commands)
        .where(
          eq(
            serviceActorVersionChainDbConfig.schema.commands.actorServiceIndex,
            resumeServiceIndex,
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
    connection.setState({ ...state, phase: 'replaying' });

    // 7 — reject a cursor beyond the tip and advance only after each send
    let deliveredThroughServiceIndex = resumeServiceIndex;
    for (;;) {
      const page = yield* getActorCommands({
        afterServiceIndex: deliveredThroughServiceIndex,
        db,
      });
      if (page.tip < deliveredThroughServiceIndex) {
        stateRequired();
        return;
      }
      for (const command of page.commands) {
        if (command.serviceIndex !== deliveredThroughServiceIndex + 1) {
          stateRequired();
          return;
        }
        yield* Effect.try({
          try: () =>
            connection.send(
              JSON.stringify({
                type: 'serviceActorCommand',
                command: filterServiceActorCommand(
                  command,
                  state.serviceSessionLock.models,
                ),
              }),
            ),
          catch: catchZerospinError({
            code: 'service-session-command-send-failed',
            message: 'Failed to replay an service definition command',
          }),
        });
        deliveredThroughServiceIndex = command.serviceIndex;
      }
      if (deliveredThroughServiceIndex === page.tip) break;
      if (page.commands.length === 0) {
        stateRequired();
        return;
      }
    }

    // 8 — send the final serviceIndex then set phase live
    connection.send(
      JSON.stringify({
        type: 'replay-complete',
        serviceIndex: deliveredThroughServiceIndex,
      }),
    );
    connection.setState({ ...state, phase: 'live' });
  },
);
