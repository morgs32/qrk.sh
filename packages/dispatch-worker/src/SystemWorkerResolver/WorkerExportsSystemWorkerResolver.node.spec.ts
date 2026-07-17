import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

const loopbackSystemWorker = vi.hoisted(() => ({
  getSystemSpec: vi.fn(),
  [Symbol.dispose]: vi.fn(),
}));

vi.mock('cloudflare:workers', () => ({
  exports: {
    SystemWorker: loopbackSystemWorker,
  },
}));

describe('WorkerExportsSystemWorkerResolver', () => {
  it('resolves the SystemWorker loopback export without a namespace lookup', async () => {
    const { SystemWorkerResolver } = await import('./SystemWorkerResolver');
    const { WorkerExportsSystemWorkerResolver } =
      await import('./WorkerExportsSystemWorkerResolver');
    const resolvedSystemWorker = Effect.runSync(
      Effect.gen(function* () {
        const resolver = yield* SystemWorkerResolver;
        return resolver.get({
          systemWorkerName: 'ignored-by-loopback-binding',
        });
      }).pipe(Effect.provide(WorkerExportsSystemWorkerResolver)),
    );

    expect(resolvedSystemWorker).toBe(loopbackSystemWorker);
  });
});
