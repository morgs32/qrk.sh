import type { IDb } from '@zerospin/core/drizzle/types';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Result, Schema } from 'effect';
import type { Connection, WSMessage } from 'partyserver';

import { getCommands } from '../getCommands/getCommands.js';

export const onMessage = Effect.fn(
  'ServiceFrontendFinalizedCommandChain.onMessage',
)(function* (props: {
  connection: Connection<{
    phase: 'awaiting-resume' | 'replaying' | 'live';
    serviceName: string;
    userId: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  }>;
  message: WSMessage;
  db: IDb;
  key: {
    systemId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
  };
}): Effect.fn.Return<void, IAnyError> {
  const { connection, db, key } = props;
  const state = connection.state;
  const stateRequired = () => {
    connection.send(JSON.stringify({ type: 'state-required' }));
    connection.close(4003, 'state-required');
  };
  if (
    state === null ||
    state === undefined ||
    state.serviceName !== key.serviceName ||
    state.userId !== key.userId ||
    state.frontendName !== key.frontendName ||
    state.phase !== 'awaiting-resume' ||
    typeof props.message !== 'string'
  ) {
    stateRequired();
    return;
  }
  const decodedResume = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(
      Schema.Struct({
        serviceFrontendIndex: Schema.Number.check(
          Schema.isInt(),
          Schema.isGreaterThanOrEqualTo(0),
        ),
      }),
    ),
  )(props.message, { onExcessProperty: 'error' }).pipe(Effect.result);
  if (Result.isFailure(decodedResume)) {
    stateRequired();
    return;
  }
  connection.setState({ ...state, phase: 'replaying' });

  let deliveredThroughServiceFrontendIndex =
    decodedResume.success.serviceFrontendIndex;
  for (;;) {
    const page = yield* getCommands({
      afterServiceFrontendIndex: deliveredThroughServiceFrontendIndex,
      db,
    });
    if (page.tip < deliveredThroughServiceFrontendIndex) {
      stateRequired();
      return;
    }
    for (const command of page.commands) {
      if (
        command.serviceFrontendIndex !==
        deliveredThroughServiceFrontendIndex + 1
      ) {
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
          message: 'Failed to replay a service frontend command',
        }),
      });
      deliveredThroughServiceFrontendIndex = command.serviceFrontendIndex;
    }
    if (deliveredThroughServiceFrontendIndex === page.tip) break;
    if (page.commands.length === 0) {
      stateRequired();
      return;
    }
  }

  connection.send(
    JSON.stringify({
      type: 'replay-complete',
      serviceFrontendIndex: deliveredThroughServiceFrontendIndex,
    }),
  );
  connection.setState({ ...state, phase: 'live' });
});
