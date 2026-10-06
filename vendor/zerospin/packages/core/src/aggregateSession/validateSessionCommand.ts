import type { IRecognizedFailure, IResult } from '@zerospin/error';
import { Effect } from 'effect';

import type { InferFailure } from '../contracts/types.ts';
import type { InferPayloadInput } from '../models/types.ts';

import { validateBoundAggregateSessionCommand } from './bindAggregateSession.ts';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from './types.ts';

/** Evaluate the bound program without applying its collected operations or consuming IDs. */
export function validateSessionCommand<
  D extends IAggregateSessionDefinition,
  K extends keyof D['contracts'] & string,
>(props: {
  session: IAggregateSession<D>;
  contractName: K;
  payload: InferPayloadInput<D['contracts'][K]['payload']>;
}): Effect.Effect<
  IResult<void, IRecognizedFailure<InferFailure<D['contracts'][K]>>>
>;
export function validateSessionCommand(props: {
  session: IAggregateSession;
  contractName: string;
  payload: unknown;
}) {
  return Effect.sync(() => validateBoundAggregateSessionCommand(props));
}
