import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadConfigFn } from './loadConfigFn.js';

const { loadEnvMock, loadZerospinConfigMock } = vi.hoisted(() => ({
  loadEnvMock: vi.fn(),
  loadZerospinConfigMock: vi.fn(),
}));

vi.mock('dotenv', () => ({
  config: loadEnvMock,
}));

vi.mock('./loadZerospinConfigFn.js', () => ({
  loadZerospinConfigFn: loadZerospinConfigMock,
}));

describe('loadConfigFn', () => {
  const originalApiUrl = process.env['ZEROSPIN_API_URL'];
  const originalNextPublicApiUrl = process.env['NEXT_PUBLIC_ZEROSPIN_API_URL'];
  const originalSecretKey = process.env['ZEROSPIN_SECRET_KEY'];

  beforeEach(() => {
    delete process.env['ZEROSPIN_API_URL'];
    delete process.env['NEXT_PUBLIC_ZEROSPIN_API_URL'];
    process.env['ZEROSPIN_SECRET_KEY'] = 'sk_test';
    loadEnvMock.mockReset();
    loadZerospinConfigMock.mockReset();
    loadZerospinConfigMock.mockReturnValue(
      Effect.succeed({
        entry: 'src/system.ts',
        seeds: {
          dev: null,
          production: null,
        },
      }),
    );
  });

  afterEach(() => {
    if (originalApiUrl === undefined) {
      delete process.env['ZEROSPIN_API_URL'];
    } else {
      process.env['ZEROSPIN_API_URL'] = originalApiUrl;
    }
    if (originalNextPublicApiUrl === undefined) {
      delete process.env['NEXT_PUBLIC_ZEROSPIN_API_URL'];
    } else {
      process.env['NEXT_PUBLIC_ZEROSPIN_API_URL'] = originalNextPublicApiUrl;
    }
    if (originalSecretKey === undefined) {
      delete process.env['ZEROSPIN_SECRET_KEY'];
    } else {
      process.env['ZEROSPIN_SECRET_KEY'] = originalSecretKey;
    }
  });

  it('loads the generic Zerospin API URL', async () => {
    process.env['ZEROSPIN_API_URL'] = 'https://production.example.com';
    process.env['NEXT_PUBLIC_ZEROSPIN_API_URL'] =
      'https://framework-specific.example.com';

    const result = await Effect.runPromise(
      loadConfigFn().pipe(
        Effect.provide(
          Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, AsyncLive),
        ),
      ),
    );

    expect(result.zerospinApiUrl).toBe('https://production.example.com');
  });

  it('ignores framework-specific variables and uses the hosted default', async () => {
    process.env['NEXT_PUBLIC_ZEROSPIN_API_URL'] =
      'https://framework-specific.example.com';

    const result = await Effect.runPromise(
      loadConfigFn().pipe(
        Effect.provide(
          Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, AsyncLive),
        ),
      ),
    );

    expect(result.zerospinApiUrl).toBe('https://api.zerospin.dev');
  });
});
