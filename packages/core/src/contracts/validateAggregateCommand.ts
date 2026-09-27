import { isZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { IAnyAuthoredAggregate } from '../aggregate/types.ts';
import type { IDb } from '../drizzle/types.ts';
import { runProgram } from '../execution/runProgram.ts';

import { validateFailure } from './failureCodec.ts';
import type { IContract } from './types.ts';

/** Authoritative only: the caller must apply mutations in the same savepoint. */
export const validateAggregateCommand = Effect.fn('validateAggregateCommand')(
  function* (props: {
    aggregate: IAnyAuthoredAggregate;
    actorName: string;
    contract: IContract;
    queryDb: Readonly<Pick<IDb, 'query'>>;
    payload: unknown;
    identity: Readonly<Record<string, unknown>>;
  }) {
    const guard =
      props.aggregate.guards[props.actorName]?.[props.contract.commandName];
    yield* runProgram(
      Effect.suspend(
        () =>
          guard?.({
            queryDb: props.queryDb,
            payload: props.payload,
            identity: props.identity,
            failures: props.contract.failures,
          }) ?? Effect.void,
      ),
    ).pipe(
      Effect.catch(failure =>
        isZerospinError(failure) && !('scope' in failure)
          ? Effect.fail(failure)
          : validateFailure(props.contract, failure).pipe(
              Effect.flatMap(Effect.fail),
            ),
      ),
    );
  },
);
