import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import { Effect } from 'effect';

import { makeCommand } from '../contracts/makeCommand.ts';
import type {
  IAggregateCommand,
  ICommand,
  IContract,
} from '../contracts/types.ts';
import type {
  IAggregateId,
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';

export const makeAggregateCommand = Effect.fn('makeAggregateCommand')(
  function* <CONTRACT extends IContract>(props: {
    contract: CONTRACT;
    aggregateId: IAggregateId;
    aggregateName: string;
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
      contract,
      aggregateId,
      aggregateName,
      payload,
      systemName,
    } = props;

    const command = yield* makeCommand({
      contract,
      payload,
    });

    return {
      ...command,
      aggregateId,
      aggregateName,
      userId: null,
      pushIndex: null,
      sessionId: null,
      frontendName: null,
      systemName,
    };
  },
);
