import type { IAnyError } from '@zerospin/error';
import { Layer, type Effect, type Scope } from 'effect';

import { initializeGuards as initializeOwnerGuards } from '../guards/initializeGuards.ts';

import type { IAnyAggregateFrontendController } from './types.ts';

export function initializeGuards<REQUIREMENTS>(props: {
  frontend: IAnyAggregateFrontendController<
    unknown,
    never,
    never,
    REQUIREMENTS
  >;
}): Effect.Effect<
  Effect.Success<
    ReturnType<typeof initializeOwnerGuards<never, unknown, unknown>>
  >,
  IAnyError,
  REQUIREMENTS | Scope.Scope
>;
export function initializeGuards<
  LAYER_SERVICES,
  LAYER_REQUIREMENTS,
  REQUIREMENTS,
>(props: {
  frontend: IAnyAggregateFrontendController<
    unknown,
    never,
    never,
    REQUIREMENTS
  >;
  layer: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
}): Effect.Effect<
  Effect.Success<
    ReturnType<typeof initializeOwnerGuards<never, unknown, unknown>>
  >,
  IAnyError,
  Exclude<REQUIREMENTS, LAYER_SERVICES> | LAYER_REQUIREMENTS | Scope.Scope
>;
export function initializeGuards(props: {
  frontend: IAnyAggregateFrontendController;
  layer?: Layer.Layer<unknown, IAnyError, unknown>;
}) {
  const { frontend, layer = Layer.empty } = props;
  return initializeOwnerGuards({
    layer,
    guardLayer: frontend.guardLayer,
    guards: Object.fromEntries(
      Object.entries(frontend.contracts).map(([name, binding]) => [
        name,
        binding.contract.guard === undefined ? [] : [binding.contract.guard],
      ]),
    ),
  });
}
