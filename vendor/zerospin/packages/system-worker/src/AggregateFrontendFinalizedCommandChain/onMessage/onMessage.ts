import type { IDb } from '@zerospin/core/drizzle/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Result, Schema } from 'effect';
import type { Connection, WSMessage } from 'partyserver';

import { getCommands } from '../getCommands/getCommands.js';

export const onMessage = Effect.fn(
  'AggregateFrontendFinalizedCommandChain.onMessage',
)(function* (props: {
  connection: Connection<{
    phase: 'awaiting-resume' | 'replaying' | 'live';
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  }>;
  message: WSMessage;
  db: IDb;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
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
    state.aggregateId !== key.aggregateId ||
    state.aggregateName !== key.aggregateName ||
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
        frontendIndex: Schema.Number.check(
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

  let deliveredThroughFrontendIndex = decodedResume.success.frontendIndex;
  for (;;) {
    const page = yield* getCommands({
      afterFrontendIndex: deliveredThroughFrontendIndex,
      db,
    });
    if (page.tip < deliveredThroughFrontendIndex) {
      stateRequired();
      return;
    }
    for (const command of page.commands) {
      if (command.frontendIndex !== deliveredThroughFrontendIndex + 1) {
        stateRequired();
        return;
      }
      yield* Effect.try({
        try: () =>
          connection.send(
            JSON.stringify({
              type: 'aggregateFrontendCommand',
              sync: command,
            }),
          ),
        catch: ZerospinError.catch({
          code: 'aggregate-frontend-command-send-failed',
          message: 'Failed to replay an aggregate frontend command',
        }),
      });
      deliveredThroughFrontendIndex = command.frontendIndex;
    }
    if (deliveredThroughFrontendIndex === page.tip) break;
    if (page.commands.length === 0) {
      stateRequired();
      return;
    }
  }

  connection.send(
    JSON.stringify({
      type: 'replay-complete',
      frontendIndex: deliveredThroughFrontendIndex,
    }),
  );
  connection.setState({ ...state, phase: 'live' });
});
