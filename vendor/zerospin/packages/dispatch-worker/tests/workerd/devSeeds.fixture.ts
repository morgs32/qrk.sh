import type { IDeploySeedCommand } from '@zerospin/core/contracts/types';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

/**
 * Shared module state proves that the Worker entrypoint and this test import
 * evaluate the configured `seeds` module in the same workerd isolate.
 */
export const seedTestState = {
  completions: 0,
  failure: '',
  runs: 0,
};

/**
 * The delay keeps two first capability requests overlapping at the Durable
 * Object readiness barrier. Empty commands isolate readiness and receipt
 * behavior from SystemRepo finalization behavior already covered elsewhere.
 */
export const seeds = Effect.gen(function* () {
  seedTestState.runs += 1;
  yield* Effect.sleep('25 millis');

  if (seedTestState.failure !== '') {
    return yield* new ZerospinError({
      code: 'fixture-dev-seeds-failed',
      message: seedTestState.failure,
    });
  }

  seedTestState.completions += 1;

  const commands: IDeploySeedCommand[] = [];
  return commands;
});
