import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { runProgram } from '../execution/runProgram.ts';

import { validateExternalResponse } from './externalResponseCodec.ts';
import type { ICommand, IContract } from './types.ts';
import { validatePayload } from './validatePayload.ts';

export type IPreparedContractInput<CONTRACT extends IContract = IContract> =
  Readonly<{
    payload: Parameters<CONTRACT['program']>[0]['payload'];
    claims: Readonly<Record<string, unknown>> | null;
    response?: unknown;
  }>;

export function prepareContractInput<CONTRACT extends IContract>(props: {
  contract: CONTRACT;
  command: Pick<ICommand, 'payload' | 'response'>;
  claims: Readonly<Record<string, unknown>> | null;
}): Effect.Effect<IPreparedContractInput<CONTRACT>, IAnyError>;
export function prepareContractInput(props: {
  contract: IContract;
  command: Pick<ICommand, 'payload' | 'response'>;
  claims: Readonly<Record<string, unknown>> | null;
}) {
  return prepare(props);
}

const prepare = Effect.fn('prepareContractInput')(function* (props: {
  contract: IContract;
  command: Pick<ICommand, 'payload' | 'response'>;
  claims: Readonly<Record<string, unknown>> | null;
}) {
  const { contract, command, claims: authenticatedClaims } = props;
  if (contract.external === undefined && command.response != null) {
    return yield* makeZerospinError('external-contract-kind-mismatch');
  }
  const externalValues =
    contract.external === undefined
      ? undefined
      : command.response === undefined
        ? yield* makeZerospinError('external-response-required')
        : yield* validateExternalResponse(
            contract,
            command.payload,
            command.response,
          );
  const payload =
    externalValues === undefined
      ? yield* validatePayload(contract, {
          version: contract.version,
          payload: command.payload,
        })
      : externalValues.payload;
  const claims =
    contract.claims === undefined
      ? authenticatedClaims
      : yield* runProgram(
          Schema.decodeUnknownEffect(Schema.toType(contract.claims))(
            authenticatedClaims,
          ).pipe(
            mapParseError({
              code: 'contract-claims-invalid',
              prefix: 'Invalid contract claims',
            }),
          ),
        );
  return {
    payload,
    claims,
    ...(externalValues === undefined
      ? {}
      : { response: externalValues.response }),
  };
});
