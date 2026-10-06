import {
  catchZerospinError,
  encodeError,
  recognizeZerospinError,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { InferPayloadInput } from '../../models/types.ts';
import { stageBoundAggregateSessionCommand } from '../bindAggregateSession.ts';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '../types.ts';

import { notifyStageFailure } from './stageFailureListeners.ts';

/** Commit local staging synchronously; the bound delivery owner handles its handoff. */
export function stageCommand<
  DEFINITION extends IAggregateSessionDefinition,
  CONTRACT_NAME extends keyof DEFINITION['contracts'] & string,
>(props: {
  session: IAggregateSession<DEFINITION>;
  contractName: CONTRACT_NAME;
  payload: InferPayloadInput<
    NonNullable<
      DEFINITION['contracts'][CONTRACT_NAME]['__payloads']
    >[DEFINITION['contracts'][CONTRACT_NAME]['version']]
  >;
}) {
  let result;
  try {
    result = stageBoundAggregateSessionCommand(props);
  } catch (cause) {
    const failure = Effect.runSync(
      encodeError(
        catchZerospinError({
          code: 'aggregate-command-staging-exception',
          message: 'Command staging failed',
        })(cause),
      ).pipe(
        Effect.map(encoded => recognizeZerospinError(Schema.Never, encoded)),
      ),
    );
    notifyStageFailure(props.session, {
      contractName: props.contractName,
      failure,
    });
    throw cause;
  }
  if (result._tag === 'Failure') {
    notifyStageFailure(props.session, {
      contractName: props.contractName,
      failure: result.failure,
    });
  }
  return result;
}
