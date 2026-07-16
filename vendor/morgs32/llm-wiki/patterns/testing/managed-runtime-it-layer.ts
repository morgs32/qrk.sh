import { it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

declare const NanoIdFactory: unknown;
declare const UlidMonotonicFactory: unknown;
declare function deployOrderWorker(props: {
  apiKey: string;
  environmentId: string;
  script: string;
  systemName: string;
  env: null;
}): Effect.Effect<{ success: boolean }, unknown, typeof NanoIdFactory>;

const DeployTestLayer = Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory);

/**
 * Capnweb/integration specs: `it.layer` with production-like layers, not a `runPromise` wrapper helper.
 *
 * @bad `function runDeploy(props) { return managedRuntime.runPromise(deploy(props)) }` — rename-only indirection.
 */
describe('deployOrderWorker', () => {
  it.layer(DeployTestLayer)(scopedIt => {
    scopedIt.effect('deploys', () =>
      Effect.fn('deployOrderWorkerSpec')(function* () {
        const result = yield* deployOrderWorker({
          apiKey: 'key',
          environmentId: 'dev',
          script: 'export default {};',
          systemName: 'system_123',
          env: null,
        });
        expect(result.success).toBe(true);
      }),
    );
  });
});
