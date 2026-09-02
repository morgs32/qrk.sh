import { type IAnyError } from '@zerospin/error';
import { makeIdFromAbbreviation, type CuidFactory } from '@zerospin/schema';
import { Effect } from 'effect';

import type {
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';
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
    abbreviation: coreAbbreviations.command,
  });
  const decodedPayload = yield* contract.validatePayload({ payload });

  return {
    commandName: contract.commandName,
    contractVersion: contract.version,
    id: commandId,
    payload: decodedPayload,
  };
});
