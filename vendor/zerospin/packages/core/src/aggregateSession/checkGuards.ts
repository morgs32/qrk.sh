import {
  encodeError,
  makeZerospinError,
  recognizeZerospinError,
  type IRecognizedFailure,
} from '@zerospin/error';
import { Context, Effect, Schema } from 'effect';

import { getFailuresCodec } from '../contracts/failures.ts';
import { runContractGuard } from '../contracts/runContractGuard.ts';
import type { InferFailure } from '../contracts/types.ts';
import { runProgram } from '../execution/runProgram.ts';
import type { InferPayloadInput } from '../models/types.ts';

import { getAggregateSessionExecutionResources } from './make/makeAggregateSession.ts';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from './types.ts';

/** Run the contract guard against the session database. Null means the guard passed. */
export function checkGuards<
  DEFINITION extends IAggregateSessionDefinition,
  NAME extends keyof DEFINITION['contracts'] & string,
>(props: {
  session: IAggregateSession<DEFINITION>;
  contractName: NAME;
  payload: InferPayloadInput<
    DEFINITION['contracts'][NAME]['contract']['payload']
  >;
}): Effect.Effect<IRecognizedFailure<
  InferFailure<DEFINITION['contracts'][NAME]['contract']>
> | null>;
export function checkGuards(props: {
  session: IAggregateSession;
  contractName: string;
  payload: unknown;
}) {
  return Effect.sync(() => {
    const resources = getAggregateSessionExecutionResources(props.session);
    const state = props.session.store.getState();
    const contract =
      props.session.definition.contracts[props.contractName]?.contract;
    if (
      resources === undefined ||
      !state.isInitialized ||
      state.db === null ||
      state.sessionStatus !== 'current' ||
      contract === undefined
    ) {
      return Effect.runSync(
        encodeError(
          makeZerospinError(
            resources === undefined ||
              !state.isInitialized ||
              state.db === null ||
              state.sessionStatus !== 'current'
              ? 'aggregate-session-not-ready'
              : 'contract-not-found',
          ),
        ).pipe(
          Effect.map(failure => recognizeZerospinError(Schema.Never, failure)),
        ),
      );
    }
    const context = Context.makeUnsafe<unknown>(
      resources.runtime.runSync(Effect.context()).mapUnsafe,
    );
    return resources.runtime.runSync(
      runContractGuard({
        contract,
        queryDb: state.db,
        payload: props.payload,
        claims: state.claims,
      }).pipe(
        runProgram,
        Effect.provideContext(context),
        Effect.matchEffect({
          onSuccess: () => Effect.succeed(null),
          onFailure: failure =>
            encodeError(failure).pipe(
              Effect.map(encoded =>
                recognizeZerospinError(
                  getFailuresCodec(contract.failures),
                  encoded,
                ),
              ),
            ),
        }),
      ),
    );
  });
}
