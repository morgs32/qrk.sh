import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

import { initializeGuards as initializeOwnerGuards } from '../guards/initializeGuards.ts';

import type { IAnyAuthoredAggregate } from './types.ts';

export function initializeGuards<AGGREGATE extends IAnyAuthoredAggregate>(
  aggregate: AGGREGATE,
): Effect.Effect<
  Effect.Success<
    ReturnType<typeof initializeOwnerGuards<never, unknown, unknown>>
  >,
  IAnyError,
  NonNullable<AGGREGATE['__initializeRequirements']>
>;
export function initializeGuards(aggregate: IAnyAuthoredAggregate) {
  return initializeOwnerGuards({
    layer: aggregate.layer,
    guardLayer: aggregate.guardLayer,
    guards: Object.fromEntries(
      Object.entries(aggregate.contracts).map(([name, binding]) => [
        name,
        [binding.guard, binding.contract.guard].filter(
          guard => guard !== undefined,
        ),
      ]),
    ),
  });
}
