import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { DevDeployApi } from './DevDeployApi.js';
import { DevDeployApiFailure } from './DevDeployApiFailure/DevDeployApiFailure.js';

const snapshot: Readonly<{
  activationCheckpoint:
    | 'allocated'
    | 'generation-prepared'
    | 'continuous-replay'
    | 'pre-cut-ready'
    | 'ownership-cut'
    | 'source-writes-terminal'
    | 'fixed-point-drained'
    | 'final-replay-complete';
  clean: boolean;
  deployId: string;
  failure: null;
  generationId: string;
  status: 'activating' | 'succeeded' | 'failed';
  workerVersionId: string;
}> = {
  activationCheckpoint: 'generation-prepared',
  clean: false,
  deployId: 'dpl_deploy_api_test',
  failure: null,
  generationId: 'gen_deploy_api_test',
  status: 'succeeded',
  workerVersionId: 'worker-version-test',
};

describe('DevDeployApi', () => {
  it('delegates all lifecycle operations and preserves snapshots', async () => {
    const startDeploy = vi.fn(async () => encodeRight(snapshot));
    const getDeploy = vi.fn(async () => encodeRight(snapshot));
    const getReadiness = vi.fn(async () => encodeRight(undefined));
    const api = new DevDeployApi({
      systemRepo: { getDeploy, getReadiness, startDeploy },
    });

    expect(
      await Effect.runPromise(
        decodeRpc(await api.startDeploy({ clean: false })),
      ),
    ).toEqual(snapshot);
    expect(
      await Effect.runPromise(
        decodeRpc(await api.getDeploy({ deployId: snapshot.deployId })),
      ),
    ).toEqual(snapshot);
    expect(
      await Effect.runPromise(decodeRpc(await api.getReadiness())),
    ).toBeUndefined();
    expect(startDeploy).toHaveBeenCalledWith({ clean: false });
    expect(getDeploy).toHaveBeenCalledWith({ deployId: snapshot.deployId });
    expect(getReadiness).toHaveBeenCalledOnce();
  });

  it('preserves encoded SystemRepo failures', async () => {
    const failure = new ZerospinError({
      code: 'system-deploy-status-not-found',
      message: 'Deploy not found',
      status: 404,
    });
    const api = new DevDeployApi({
      systemRepo: {
        startDeploy: vi.fn(async () => encodeLeft(failure)),
        getDeploy: vi.fn(async () => encodeLeft(failure)),
        getReadiness: vi.fn(async () => encodeLeft(failure)),
      },
    });

    const settled = await Effect.runPromise(
      decodeRpc(await api.getDeploy({ deployId: 'dpl_missing' })).pipe(
        Effect.flip,
      ),
    );
    expect(settled).toMatchObject({
      code: 'system-deploy-status-not-found',
      status: 404,
    });
  });

  it('classifies only unknown raw RPC throws', async () => {
    const api = new DevDeployApi({
      systemRepo: {
        startDeploy: vi.fn(async () => {
          throw new Error('transport closed');
        }),
        getDeploy: vi.fn(async () => {
          throw new Error('transport closed');
        }),
        getReadiness: vi.fn(async () => {
          throw new Error('transport closed');
        }),
      },
    });

    const requested = await Effect.runPromise(
      decodeRpc(await api.startDeploy({ clean: false })).pipe(Effect.flip),
    );
    const loaded = await Effect.runPromise(
      decodeRpc(await api.getDeploy({ deployId: snapshot.deployId })).pipe(
        Effect.flip,
      ),
    );
    const ready = await Effect.runPromise(
      decodeRpc(await api.getReadiness()).pipe(Effect.flip),
    );
    expect(requested.code).toBe('failed-to-start-deploy-rpc');
    expect(requested.cause).toContain('transport closed');
    expect(loaded.code).toBe('failed-to-get-deploy-rpc');
    expect(loaded.cause).toContain('transport closed');
    expect(ready.code).toBe('failed-to-get-readiness-rpc');
    expect(ready.cause).toContain('transport closed');
  });

  it('replays one captured acquisition failure from every method', async () => {
    const failure = new ZerospinError({
      code: 'dev-deploy-api-unavailable',
      message: 'The Dev deploy API is unavailable in Production',
      status: 400,
    });
    const api = new DevDeployApiFailure(failure);

    const requested = await Effect.runPromise(
      decodeRpc(await api.startDeploy({ clean: false })).pipe(Effect.flip),
    );
    const loaded = await Effect.runPromise(
      decodeRpc(await api.getDeploy({ deployId: 'dpl_ignored' })).pipe(
        Effect.flip,
      ),
    );
    const ready = await Effect.runPromise(
      decodeRpc(await api.getReadiness()).pipe(Effect.flip),
    );

    expect(requested).toMatchObject({ code: failure.code, status: 400 });
    expect(loaded).toMatchObject({ code: failure.code, status: 400 });
    expect(ready).toMatchObject({ code: failure.code, status: 400 });
  });
});
