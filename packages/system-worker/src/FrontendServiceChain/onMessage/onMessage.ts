import type { IDb } from '@zerospin/core/drizzle/types';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Result, Schema } from 'effect';
import type { Connection, WSMessage } from 'partyserver';

import { getCommands } from '../getCommands/getCommands.js';

/*
 * The service frontend log handles the one initial resume message by
 * replaying its retained suffix before marking the connection live. Invalid
 * state or an unavailable cursor requests a fresh snapshot and closes the socket.
 *
 * 1. Read the retained connection admission.
 * 2. Define snapshot-required termination.
 * 3. Require the admitted awaiting-resume state.
 * 4. Decode the nonnegative resume cursor.
 * 5. Enter replay mode.
 * 6. Replay contiguous retained pages.
 * 7. Complete replay and enable live delivery.
 */
export const onMessage = Effect.fn('FrontendServiceChain.onMessage')(
  function* (props: {
    connection: Connection<{
      phase: 'awaiting-resume' | 'replaying' | 'live';
      serviceName: string;
      serviceVersion: string;
      userId: string;
      frontendName: string;
      serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
    }>;
    message: WSMessage;
    db: IDb;
    key: {
      systemId: string;
      serviceName: string;
      serviceVersion: string;
      userId: string;
      frontendName: string;
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
      state.userId !== key.userId ||
      state.frontendName !== key.frontendName ||
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
        }),
      ),
    )(message, { onExcessProperty: 'error' }).pipe(Effect.result);
    if (Result.isFailure(decodedResume)) {
      stateRequired();
      return;
    }

    // 5 — keep the admitted target while replaying retained output
    connection.setState({ ...state, phase: 'replaying' });

    // 6 — reject a cursor beyond the tip and advance only after each send
    let deliveredThroughServiceIndex = decodedResume.success.serviceIndex;
    for (;;) {
      const page = yield* getCommands({
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
                type: 'serviceFrontendCommand',
                sync: command,
              }),
            ),
          catch: ZerospinError.catch({
            code: 'service-frontend-command-send-failed',
            message: 'Failed to replay an service frontend command',
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

    // 7 — send the final serviceIndex then set phase live
    connection.send(
      JSON.stringify({
        type: 'replay-complete',
        serviceIndex: deliveredThroughServiceIndex,
      }),
    );
    connection.setState({ ...state, phase: 'live' });
  },
);
