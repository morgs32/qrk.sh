import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { makeCommand } from '../contracts/makeCommand.ts';
import type {
  IAggregateCommand,
  ICommand,
  IContract,
  ISessionId,
} from '../contracts/types.ts';
import type {
  IAggregateId,
  InferCommandPayload,
  InferPayloadInput,
  IPushedCursorId,
} from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';

export const makeAggregateCommand = Effect.fn('makeAggregateCommand')(
  function* <CONTRACT extends IContract>(props: {
    contract: CONTRACT;
    aggregateId: IAggregateId;
    aggregateName: string;
    userId?: string | null;
    sessionId?: ISessionId | null;
    frontendName?: string | null;
    pushedCursor?: IPushedCursorId | null;
    systemName: string;
    payload: InferPayloadInput<CONTRACT['payload']>;
  }): Effect.fn.Return<
    IAggregateCommand<
      ICommand<
        CONTRACT['commandName'],
        CONTRACT['version'],
        InferCommandPayload<CONTRACT['payload']>
      >
    >,
    IAnyError,
    CuidFactory
  > {
    const {
      userId = null,
      contract,
      aggregateId,
      aggregateName,
      payload,
      pushedCursor = null,
      sessionId = null,
      frontendName = null,
      systemName,
    } = props;

    const command = yield* makeCommand({
      contract,
      payload,
    });

    return {
      ...command,
      commandType: 'aggregate',
      aggregateId,
      aggregateName,
      userId,
      pushedCursor,
      sessionId,
      frontendName,
      systemName,
    };
  },
);
