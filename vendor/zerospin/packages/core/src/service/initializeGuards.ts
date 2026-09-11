import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

import { initializeGuards as initializeOwnerGuards } from '../guards/initializeGuards.ts';

import type { IAnyService } from './types.ts';

export function initializeGuards<SERVICE extends IAnyService>(
  service: SERVICE,
): Effect.Effect<
  Effect.Success<
    ReturnType<typeof initializeOwnerGuards<never, unknown, unknown>>
  >,
  IAnyError,
  NonNullable<SERVICE['__initializeRequirements']>
>;
export function initializeGuards(service: IAnyService) {
  return initializeOwnerGuards({
    layer: service.layer,
    guards: Object.fromEntries(
      Object.entries(service.contracts).map(([name, contract]) => [
        name,
        [contract.guard].filter(guard => guard !== undefined),
      ]),
    ),
  });
}
