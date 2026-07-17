import { type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type {
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';
import { cloudIdAbbreviations } from '../utils/cloudIdAbbreviations.ts';
import { makeIdFromAbbreviation } from '../utils/makeIdFromAbbreviation.ts';
import type { Prettify } from '../utils/types';

import type { ICommand, IContract } from './types.ts';

export const makeCommand = Effect.fn('makeCommand')(function* <
  CONTRACT extends IContract,
>(props: {
  contract: CONTRACT;
  payload: InferPayloadInput<CONTRACT['payload']>;
}): Effect.fn.Return<
  Prettify<
    ICommand<
      CONTRACT['commandName'],
      CONTRACT['version'],
      InferCommandPayload<CONTRACT['payload']>
    >
  >,
  IAnyError,
  CuidFactory
> {
  const { contract, payload } = props;
  const commandId = yield* makeIdFromAbbreviation({
    abbreviation: cloudIdAbbreviations.command,
  });
  const decodedPayload = yield* contract.validatePayload({ payload });

  return {
    commandName: contract.commandName,
    id: commandId,
    payload: decodedPayload,
    version: contract.version,
  };
});
