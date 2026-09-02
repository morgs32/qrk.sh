import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkWranglerConfigFn } from './checkWranglerConfigFn.js';

const { loadConfigMock } = vi.hoisted(() => ({
  loadConfigMock: vi.fn(),
}));

vi.mock('c12', () => ({
  loadConfig: loadConfigMock,
}));

const validWranglerConfig = {
  compatibility_date: '2026-01-20',
  compatibility_flags: ['nodejs_compat'],
  durable_objects: {
    bindings: [{ name: 'SYSTEM_REPO', class_name: 'SystemRepo' }],
  },
  exports: {
    SystemRepo: {
      type: 'durable-object',
      storage: 'sqlite',
    },
  },
  vars: {
    ZEROSPIN_SYSTEM_ID: 'sys_test',
  },
};

describe('checkWranglerConfigFn', () => {
  beforeEach(() => {
    loadConfigMock.mockReset();
    loadConfigMock.mockResolvedValue({ config: validWranglerConfig });
  });

  it('returns the validated Zerospin system id', async () => {
    await expect(
      Effect.runPromise(
        checkWranglerConfigFn().pipe(Effect.provide(AsyncLive)),
      ),
    ).resolves.toBe('sys_test');
  });

  it('reports a Wrangler config load failure', async () => {
    loadConfigMock.mockRejectedValue(new Error('config missing'));

    await expect(
      Effect.runPromise(
        checkWranglerConfigFn().pipe(Effect.provide(AsyncLive), Effect.flip),
      ),
    ).resolves.toMatchObject({
      code: 'zerospin-dev-wrangler-config-load-failed',
      cause: expect.stringContaining('config missing'),
    });
  });

  it('requires a Zerospin system id', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        ...validWranglerConfig,
        vars: { ZEROSPIN_SYSTEM_ID: '' },
      },
    });

    await expect(
      Effect.runPromise(
        checkWranglerConfigFn().pipe(Effect.provide(AsyncLive), Effect.flip),
      ),
    ).resolves.toMatchObject({
      code: 'zerospin-dev-wrangler-config-invalid',
    });
  });

  it('requires an ISO compatibility date', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        ...validWranglerConfig,
        compatibility_date: 'not-a-date',
      },
    });

    await expect(
      Effect.runPromise(
        checkWranglerConfigFn().pipe(Effect.provide(AsyncLive), Effect.flip),
      ),
    ).resolves.toMatchObject({
      code: 'zerospin-dev-wrangler-config-invalid',
      cause: expect.stringContaining('YYYY-MM-DD'),
    });
  });

  it('requires nodejs_compat', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        ...validWranglerConfig,
        compatibility_flags: [],
      },
    });

    await expect(
      Effect.runPromise(
        checkWranglerConfigFn().pipe(Effect.provide(AsyncLive), Effect.flip),
      ),
    ).resolves.toMatchObject({
      code: 'zerospin-dev-wrangler-config-invalid',
      cause: expect.stringContaining('nodejs_compat'),
    });
  });

  it('requires a live SQLite SystemRepo export', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        ...validWranglerConfig,
        exports: {
          SystemRepo: {
            type: 'durable-object',
            storage: 'legacy-kv',
          },
        },
      },
    });

    await expect(
      Effect.runPromise(
        checkWranglerConfigFn().pipe(Effect.provide(AsyncLive), Effect.flip),
      ),
    ).resolves.toMatchObject({
      code: 'zerospin-dev-wrangler-config-invalid',
      cause: expect.stringContaining('sqlite'),
    });
  });

  it('requires the direct SystemRepo binding', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        ...validWranglerConfig,
        durable_objects: { bindings: [] },
      },
    });

    await expect(
      Effect.runPromise(
        checkWranglerConfigFn().pipe(Effect.provide(AsyncLive), Effect.flip),
      ),
    ).resolves.toMatchObject({
      code: 'zerospin-dev-wrangler-config-invalid',
      cause: expect.stringContaining('SYSTEM_REPO'),
    });
  });
});
