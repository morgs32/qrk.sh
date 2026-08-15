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
  migrations: [
    {
      tag: 'v1',
      new_sqlite_classes: ['SystemRepo'],
    },
  ],
  version_metadata: {
    binding: 'WORKER_VERSION_METADATA',
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

  it('requires the ctx.exports compatibility-date default', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        ...validWranglerConfig,
        compatibility_date: '2025-11-16',
      },
    });

    await expect(
      Effect.runPromise(
        checkWranglerConfigFn().pipe(Effect.provide(AsyncLive), Effect.flip),
      ),
    ).resolves.toMatchObject({
      code: 'zerospin-dev-wrangler-config-invalid',
      cause: expect.stringContaining('2025-11-17'),
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

  it('rejects disable_ctx_exports', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        ...validWranglerConfig,
        compatibility_flags: ['nodejs_compat', 'disable_ctx_exports'],
      },
    });

    await expect(
      Effect.runPromise(
        checkWranglerConfigFn().pipe(Effect.provide(AsyncLive), Effect.flip),
      ),
    ).resolves.toMatchObject({
      code: 'zerospin-dev-wrangler-config-invalid',
      cause: expect.stringContaining('disable_ctx_exports'),
    });
  });

  it('requires authored version metadata', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        ...validWranglerConfig,
        version_metadata: { binding: 'OTHER_BINDING' },
      },
    });

    await expect(
      Effect.runPromise(
        checkWranglerConfigFn().pipe(Effect.provide(AsyncLive), Effect.flip),
      ),
    ).resolves.toMatchObject({
      code: 'zerospin-dev-wrangler-config-invalid',
      cause: expect.stringContaining('WORKER_VERSION_METADATA'),
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

  it('requires an authored SystemRepo migration', async () => {
    loadConfigMock.mockResolvedValue({
      config: {
        ...validWranglerConfig,
        migrations: [{ tag: 'v1', new_sqlite_classes: ['AuthoredRepo'] }],
      },
    });

    await expect(
      Effect.runPromise(
        checkWranglerConfigFn().pipe(Effect.provide(AsyncLive), Effect.flip),
      ),
    ).resolves.toMatchObject({
      code: 'zerospin-dev-wrangler-config-invalid',
      cause: expect.stringContaining('SystemRepo'),
    });
  });
});
