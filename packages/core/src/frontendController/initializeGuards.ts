import type { IAnyError } from '@zerospin/error';
import type { Effect, Scope } from 'effect';

import { initializeGuards as initializeOwnerGuards } from '../guards/initializeGuards.ts';

import type { IAnyAggregateFrontendController } from './types.ts';

export function initializeGuards<REQUIREMENTS>(
  frontend: IAnyAggregateFrontendController<
    unknown,
    never,
    unknown,
    REQUIREMENTS
  >,
): Effect.Effect<
  Effect.Success<
    ReturnType<typeof initializeOwnerGuards<never, unknown, unknown>>
  >,
  IAnyError,
  REQUIREMENTS | Scope.Scope
>;
export function initializeGuards(frontend: IAnyAggregateFrontendController) {
  return initializeOwnerGuards({
    layer: frontend.layer,
    guards: Object.fromEntries(
      Object.entries(frontend.contracts).map(([name, binding]) => [
        name,
        binding.contract.guard === undefined ? [] : [binding.contract.guard],
      ]),
    ),
  });
}
