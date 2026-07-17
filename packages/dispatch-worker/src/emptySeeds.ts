import type { IDeploySeedCommand } from '@zerospin/core/contracts/types';
import { Effect } from 'effect';

/**
 * Wrangler aliases `seeds` to this module when zerospin.config has no seed
 * path. Keeping the fallback as an Effect means DevZerospinApis has one import
 * and one execution path regardless of whether a project declares seeds.
 */
export const seeds: Effect.Effect<readonly IDeploySeedCommand[]> =
  Effect.succeed([]);
