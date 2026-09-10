import { type IAnyError } from '@zerospin/error';
import { makeIdFromAbbreviation, type CuidFactory } from '@zerospin/schema';
import { Effect } from 'effect';

import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

import type { IContract, InferCommand, ISessionId } from './types.ts';

export const makeSessionCommand = Effect.fn('makeSessionCommand')(function* <
  CONTRACT extends IContract,
  VERSION extends keyof NonNullable<CONTRACT['__payloads']> & string,
>(props: {
  aggregateId: string;
  aggregateName: string;
  userId: string;
  contract: CONTRACT;
  version: VERSION;
  validatedPayload: InferCommand<CONTRACT, VERSION>['payload'];
  sessionId: ISessionId;
  frontendName: string;
  systemName: string;
}): Effect.fn.Return<InferCommand<CONTRACT, VERSION>, IAnyError, CuidFactory> {
  const {
    aggregateId,
    aggregateName,
    userId,
    contract,
    version,
    validatedPayload,
    sessionId,
    frontendName,
    systemName,
  } = props;
  const commandId = yield* makeIdFromAbbreviation({
    abbreviation: coreAbbreviations.command,
  });

  return {
    commandName: contract.commandName,
    contractVersion: version,
    id: commandId,
    payload: validatedPayload,
    aggregateId,
    aggregateName,
    userId,
    pushIndex: null,
    sessionId,
    frontendName,
    systemName,
  };
});
