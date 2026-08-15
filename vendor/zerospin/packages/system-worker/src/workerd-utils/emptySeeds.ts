import type { IDeploySeedCommand } from '@zerospin/core/contracts/types';
import { Effect } from 'effect';

export const seeds: Effect.Effect<readonly IDeploySeedCommand[]> =
  Effect.succeed([]);
