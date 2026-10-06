import type { IRecognizedFailure } from '@zerospin/error';
import { Effect } from 'effect';

import type { InferFailure } from '../contracts/types.ts';
import type { InferPayloadInput } from '../models/types.ts';

import { checkBoundAggregateSessionGuards } from './bindAggregateSession.ts';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from './types.ts';

/** Run the bound contract guard against the session database; null means it passed. */
export function checkGuards<
  D extends IAggregateSessionDefinition,
  K extends keyof D['contracts'] & string,
>(props: {
  session: IAggregateSession<D>;
  contractName: K;
  payload: InferPayloadInput<D['contracts'][K]['payload']>;
}): Effect.Effect<IRecognizedFailure<InferFailure<D['contracts'][K]>> | null>;
export function checkGuards(props: {
  session: IAggregateSession;
  contractName: string;
  payload: unknown;
}) {
  return Effect.sync(() => checkBoundAggregateSessionGuards(props));
}
