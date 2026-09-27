import { type IAnyError } from '@zerospin/error';
import { makeIdFromAbbreviation, type CuidFactory } from '@zerospin/schema';
import { Effect } from 'effect';

import type {
  IContract,
  InferCommand,
  ISessionId,
} from '../../../contracts/types.ts';
import { coreAbbreviations } from '../../../utils/coreAbbreviations.ts';

export const makeSessionCommand = Effect.fn('makeSessionCommand')(function* <
  CONTRACT extends IContract,
  VERSION extends keyof NonNullable<CONTRACT['__payloads']> & string,
>(props: {
  aggregateId: string;
  aggregateName: string;
  identity: Readonly<Record<string, unknown>>;
  actorName: string;
  actorVersion: string;
  contract: CONTRACT;
  version: VERSION;
  validatedPayload: NoInfer<InferCommand<CONTRACT, VERSION>['payload']>;
  sessionId: ISessionId;
  sessionName: string;
}): Effect.fn.Return<InferCommand<CONTRACT, VERSION>, IAnyError, CuidFactory> {
  const {
    aggregateId,
    aggregateName,
    identity,
    actorName,
    actorVersion,
    contract,
    version,
    validatedPayload,
    sessionId,
    sessionName,
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
    identity,
    actorName,
    actorVersion,
    pushIndex: null,
    sessionId,
    sessionName,
  };
});
