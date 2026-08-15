import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { ProductionDeployApi } from './ProductionDeployApi.js';
import { ProductionDeployApiFailure } from './ProductionDeployApiFailure/ProductionDeployApiFailure.js';

describe('ProductionDeployApi', () => {
  it('delegates readiness and preserves an encoded SystemRepo failure', async () => {
    const activating = new ZerospinError({
      code: 'system-deploy-activating',
      message: 'The Production deploy is still activating',
      status: 503,
    });
    const getReadiness = vi
      .fn()
      .mockResolvedValueOnce(encodeRight(undefined))
      .mockResolvedValueOnce(encodeLeft(activating));
    const api = new ProductionDeployApi({ systemRepo: { getReadiness } });

    expect(
      await Effect.runPromise(decodeRpc(await api.getReadiness())),
    ).toBeUndefined();
    const settled = await Effect.runPromise(
      decodeRpc(await api.getReadiness()).pipe(Effect.flip),
    );
    expect(settled).toMatchObject({
      code: 'system-deploy-activating',
      status: 503,
    });
  });

  it('classifies unknown raw readiness throws', async () => {
    const api = new ProductionDeployApi({
      systemRepo: {
        getReadiness: vi.fn(async () => {
          throw new Error('transport closed');
        }),
      },
    });

    const settled = await Effect.runPromise(
      decodeRpc(await api.getReadiness()).pipe(Effect.flip),
    );
    expect(settled.code).toBe('failed-to-get-readiness-rpc');
    expect(settled.cause).toContain('transport closed');
  });

  it('replays its captured acquisition failure', async () => {
    const failure = new ZerospinError({
      code: 'production-deploy-api-unavailable',
      message: 'The Production deploy API is unavailable in Development',
      status: 400,
    });
    const api = new ProductionDeployApiFailure(failure);

    const settled = await Effect.runPromise(
      decodeRpc(await api.getReadiness()).pipe(Effect.flip),
    );
    expect(settled).toMatchObject({ code: failure.code, status: 400 });
  });
});
