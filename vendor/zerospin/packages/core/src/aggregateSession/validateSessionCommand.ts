import {
  encodeError,
  makeZerospinError,
  recognizeZerospinError,
  type IRecognizedFailure,
  type IResult,
} from '@zerospin/error';
import { CuidFactory } from '@zerospin/schema';
import { Context, Effect } from 'effect';

import { getFailuresCodec } from '../contracts/failures.ts';
import { makeMutations } from '../contracts/make/makeMutations.ts';
import { runContractGuard } from '../contracts/runContractGuard.ts';
import type { InferFailure } from '../contracts/types.ts';
import { runProgram } from '../execution/runProgram.ts';
import type { InferPayloadInput } from '../models/types.ts';
import { MonotonicFactory } from '../services/MonotonicFactory.ts';

import { getAggregateSessionExecutionResources } from './make/makeAggregateSession.ts';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from './types.ts';

export function validateSessionCommand<
  DEFINITION extends IAggregateSessionDefinition,
  NAME extends keyof DEFINITION['contracts'] & string,
>(props: {
  session: IAggregateSession<DEFINITION>;
  contractName: NAME;
  payload: InferPayloadInput<
    DEFINITION['contracts'][NAME]['contract']['payload']
  >;
}): Effect.Effect<
  IResult<
    void,
    IRecognizedFailure<InferFailure<DEFINITION['contracts'][NAME]['contract']>>
  >
>;
export function validateSessionCommand(props: {
  session: IAggregateSession;
  contractName: string;
  payload: unknown;
}) {
  return Effect.suspend(() => {
    const resources = getAggregateSessionExecutionResources(props.session);
    const state = props.session.store.getState();
    const contract =
      props.session.definition.contracts[props.contractName]?.contract;
    const evaluate = Effect.gen(function* () {
      if (
        resources === undefined ||
        !state.isInitialized ||
        state.db === null ||
        state.sessionStatus !== 'current'
      ) {
        return yield* makeZerospinError('aggregate-session-not-ready');
      }
      if (contract === undefined) {
        return yield* makeZerospinError('contract-not-found');
      }
      const application = yield* resources.runtime.contextEffect;
      const context = Context.makeUnsafe<unknown>(application.mapUnsafe);
      let localId = 0;
      yield* runContractGuard({
        contract,
        queryDb: state.db,
        payload: props.payload,
        claims: state.claims,
      }).pipe(
        Effect.andThen(
          makeMutations({
            contract,
            models: props.session.definition.models,
            command: {
              id: 'cmd_validation',
              commandName: contract.commandName,
              contractVersion: contract.version,
              payload: props.payload,
            },
            claims: state.claims,
          }),
        ),
        runProgram,
        Effect.provideService(CuidFactory, () =>
          Effect.sync(() => `validation${++localId}`),
        ),
        Effect.provideService(MonotonicFactory, () =>
          Effect.sync(() => `validation${++localId}`),
        ),
        Effect.provideContext(context),
      );
    });
    return evaluate.pipe(
      Effect.matchEffect({
        onSuccess: () =>
          Effect.succeed({ _tag: 'Success' as const, success: undefined }),
        onFailure: failure =>
          encodeError(failure).pipe(
            Effect.map(failure => ({
              _tag: 'Failure' as const,
              failure: recognizeZerospinError(
                getFailuresCodec(contract?.failures ?? {}),
                failure,
              ),
            })),
          ),
      }),
    );
  });
}
