declare module 'seeds' {
  import type { IDeploySeedCommand } from '@zerospin/core/contracts/types';
  import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
  import type { IAnyError } from '@zerospin/error';
  import type { Effect } from 'effect';

  export const seeds: Effect.Effect<
    readonly IDeploySeedCommand[],
    IAnyError,
    CuidFactory
  >;
}
