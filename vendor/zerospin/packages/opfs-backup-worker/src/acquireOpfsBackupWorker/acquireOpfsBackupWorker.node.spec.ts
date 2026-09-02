import type { ISessionId } from '@zerospin/core/session/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import type { IEncodedResult } from '@zerospin/error';
import { newMessagePortRpcSession, RpcTarget } from 'capnweb';
import { Effect, Result, Schema } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OpfsBackupRouterApi } from '../OpfsBackupRouter/OpfsBackupRouterApi.ts';
import { acquireOpfsBackupWorker } from './acquireOpfsBackupWorker.ts';

describe('acquireOpfsBackupWorker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects environments without SharedWorker support before creating a port', async () => {
    vi.stubGlobal('SharedWorker', undefined);
    vi.stubGlobal('MessagePort', undefined);

    const result = await Effect.runPromise(
      Effect.scoped(acquireOpfsBackupWorker()).pipe(Effect.result),
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.code).toBe('opfs-backup-worker-unavailable');
    }
  });

  it('routes FIFO, never replays uncertain work, replaces stale leaders, cleans up clients, and replaces mediator state', async () => {
    let connectListener: EventListener | undefined;
    vi.stubGlobal(
      'addEventListener',
      vi.fn(
        (
          type: string,
          listener: EventListenerOrEventListenerObject,
        ): void => {
          if (type === 'connect' && typeof listener === 'function') {
            connectListener = listener;
          }
        },
      ),
    );
    vi.stubGlobal(
      'location',
      new URL(
        'https://example.test/opfsBackupWorker.bundle.js?graphName=router-test',
      ),
    );
    vi.stubGlobal('navigator', {
      locks: {
        request: vi.fn(
          (
            name: string,
            options: LockOptions,
            callback: LockGrantedCallback,
          ) => {
            const lock: Lock = {
              mode: options.mode ?? 'exclusive',
              name,
            };
            return Promise.resolve(callback(lock));
          },
        ),
      },
    });
    vi.resetModules();
    await import('../opfsBackupWorker.entry.ts');
    if (connectListener === undefined) {
      throw new Error('The router must install its SharedWorker listener');
    }

    const firstControl = new MessageChannel();
    const firstReady = Promise.withResolvers<void>();
    firstControl.port2.addEventListener('message', event => {
      if (event.data?.type === 'RouterReady') firstReady.resolve();
    });
    firstControl.port2.start();
    connectListener(
      new MessageEvent('connect', { ports: [firstControl.port1] }),
    );
    await firstReady.promise;
    const firstClientChannel = new MessageChannel();
    firstControl.port2.postMessage(
      { type: 'RegisterClient', port: firstClientChannel.port1 },
      [firstClientChannel.port1],
    );
    firstClientChannel.port2.start();
    const firstClient =
      newMessagePortRpcSession<OpfsBackupRouterApi>(firstClientChannel.port2);

    const secondControl = new MessageChannel();
    const secondReady = Promise.withResolvers<void>();
    secondControl.port2.addEventListener('message', event => {
      if (event.data?.type === 'RouterReady') secondReady.resolve();
    });
    secondControl.port2.start();
    connectListener(
      new MessageEvent('connect', { ports: [secondControl.port1] }),
    );
    await secondReady.promise;
    const secondClientChannel = new MessageChannel();
    secondControl.port2.postMessage(
      { type: 'RegisterClient', port: secondClientChannel.port1 },
      [secondClientChannel.port1],
    );
    secondClientChannel.port2.start();
    const secondClient =
      newMessagePortRpcSession<OpfsBackupRouterApi>(secondClientChannel.port2);

    const firstSessionId = Schema.decodeUnknownSync(
      Schema.declare(
        (input: unknown): input is ISessionId =>
          typeof input === 'string' && input.startsWith('sesn_'),
      ),
    )('sesn_router_first');
    const secondSessionId = Schema.decodeUnknownSync(
      Schema.declare(
        (input: unknown): input is ISessionId =>
          typeof input === 'string' && input.startsWith('sesn_'),
      ),
    )('sesn_router_second');
    const firstQueued = firstClient.listSessionBackups({
      backupKey: 'a'.repeat(64),
    });
    const secondQueued = secondClient.listSessionBackups({
      backupKey: 'b'.repeat(64),
    });
    const firstLeaderCalls: string[] = [];
    const firstBlockedApply = Promise.withResolvers<
      IEncodedResult<void, never>
    >();
    let blockFirstApply = true;
    const firstLeader = new (class extends RpcTarget {
      async listSessionBackups(props: {
        backupClientId: number;
        backupKey: string;
      }) {
        firstLeaderCalls.push(
          `list:${props.backupClientId}:${props.backupKey}`,
        );
        return encodeSuccess([]);
      }

      async applyTransaction(props: {
        backupClientId: number;
        sessionId: ISessionId;
      }) {
        firstLeaderCalls.push(
          `apply:${props.backupClientId}:${props.sessionId}`,
        );
        if (blockFirstApply) return firstBlockedApply.promise;
        return encodeSuccess(undefined);
      }

      async releaseClient(props: { backupClientId: number }) {
        firstLeaderCalls.push(`release:${props.backupClientId}`);
        return encodeSuccess(undefined);
      }
    })();
    const firstLeaderChannel = new MessageChannel();
    firstLeaderChannel.port1.start();
    const firstLeaderSession = newMessagePortRpcSession(
      firstLeaderChannel.port1,
      firstLeader,
    );
    firstControl.port2.postMessage(
      { type: 'InstallLeader', port: firstLeaderChannel.port2 },
      [firstLeaderChannel.port2],
    );

    await expect(firstQueued).resolves.toEqual({
      _tag: 'Success',
      success: [],
    });
    await expect(secondQueued).resolves.toEqual({
      _tag: 'Success',
      success: [],
    });
    expect(firstLeaderCalls).toEqual([
      `list:1:${'a'.repeat(64)}`,
      `list:2:${'b'.repeat(64)}`,
    ]);

    const uncertainCall = firstClient.applyTransaction({
      backupKey: 'a'.repeat(64),
      sessionId: firstSessionId,
      statements: [],
    });
    await expect
      .poll(() => firstLeaderCalls.at(-1))
      .toBe(`apply:1:${firstSessionId}`);
    firstLeaderSession[Symbol.dispose]();
    firstLeaderChannel.port1.close();
    const uncertainResult = await Effect.runPromise(
      Effect.tryPromise(() => uncertainCall).pipe(
        Effect.flatMap(decodeRpc),
        Effect.result,
      ),
    );
    expect(Result.isFailure(uncertainResult)).toBe(true);
    if (Result.isFailure(uncertainResult)) {
      expect(uncertainResult.failure.code).toBe(
        'opfs-backup-request-uncertain',
      );
    }
    blockFirstApply = false;

    const replacementCalls: string[] = [];
    const replacementApply = Promise.withResolvers<
      IEncodedResult<void, never>
    >();
    const replacementReleaseCalls: number[] = [];
    const replacementLeader = new (class extends RpcTarget {
      async applyTransaction(props: {
        backupClientId: number;
        sessionId: ISessionId;
      }) {
        replacementCalls.push(
          `apply:${props.backupClientId}:${props.sessionId}`,
        );
        return replacementApply.promise;
      }

      async releaseClient(props: { backupClientId: number }) {
        replacementReleaseCalls.push(props.backupClientId);
        return encodeSuccess(undefined);
      }
    })();
    const replacementChannel = new MessageChannel();
    replacementChannel.port1.start();
    const replacementSession = newMessagePortRpcSession(
      replacementChannel.port1,
      replacementLeader,
    );
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    secondControl.port2.postMessage(
      { type: 'InstallLeader', port: replacementChannel.port2 },
      [replacementChannel.port2],
    );
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(replacementCalls).toEqual([]);

    const secondInFlight = secondClient.applyTransaction({
      backupKey: 'b'.repeat(64),
      sessionId: secondSessionId,
      statements: [],
    });
    await expect
      .poll(() => replacementCalls)
      .toEqual([`apply:2:${secondSessionId}`]);
    const observedSecondInFlight = secondInFlight.catch(() => undefined);
    secondClient[Symbol.dispose]();
    secondClientChannel.port2.close();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(replacementReleaseCalls).toEqual([]);
    replacementApply.resolve(encodeSuccess(undefined));
    await observedSecondInFlight;
    await expect
      .poll(() => replacementReleaseCalls)
      .toEqual([2]);

    const staleControl = new MessageChannel();
    const staleReady = Promise.withResolvers<void>();
    staleControl.port2.addEventListener('message', event => {
      if (event.data?.type === 'RouterReady') staleReady.resolve();
    });
    staleControl.port2.start();
    connectListener(
      new MessageEvent('connect', { ports: [staleControl.port1] }),
    );
    await staleReady.promise;
    const staleLeaderChannel = new MessageChannel();
    const replacedLeaderClosed = Promise.withResolvers<void>();
    replacementChannel.port1.addEventListener(
      'close',
      () => replacedLeaderClosed.resolve(),
      { once: true },
    );
    staleLeaderChannel.port1.start();
    newMessagePortRpcSession(
      staleLeaderChannel.port1,
      new (class extends RpcTarget {})(),
    );
    staleControl.port2.postMessage(
      { type: 'InstallLeader', port: staleLeaderChannel.port2 },
      [staleLeaderChannel.port2],
    );
    await replacedLeaderClosed.promise;

    replacementSession[Symbol.dispose]();
    replacementChannel.port1.close();
    staleLeaderChannel.port1.close();
    firstClient[Symbol.dispose]();
    firstClientChannel.port2.close();
    firstControl.port2.close();
    secondControl.port2.close();
    staleControl.port2.close();

    let replacementConnectListener: EventListener | undefined;
    vi.stubGlobal(
      'addEventListener',
      vi.fn(
        (
          type: string,
          listener: EventListenerOrEventListenerObject,
        ): void => {
          if (type === 'connect' && typeof listener === 'function') {
            replacementConnectListener = listener;
          }
        },
      ),
    );
    vi.resetModules();
    await import('../opfsBackupWorker.entry.ts');
    if (replacementConnectListener === undefined) {
      throw new Error('The replacement mediator must install its listener');
    }
    const replacementControl = new MessageChannel();
    const replacementReady = Promise.withResolvers<void>();
    replacementControl.port2.addEventListener('message', event => {
      if (event.data?.type === 'RouterReady') replacementReady.resolve();
    });
    replacementControl.port2.start();
    replacementConnectListener(
      new MessageEvent('connect', { ports: [replacementControl.port1] }),
    );
    await replacementReady.promise;
    const replacementClientChannel = new MessageChannel();
    replacementControl.port2.postMessage(
      { type: 'RegisterClient', port: replacementClientChannel.port1 },
      [replacementClientChannel.port1],
    );
    replacementClientChannel.port2.start();
    const replacementClient =
      newMessagePortRpcSession<OpfsBackupRouterApi>(
        replacementClientChannel.port2,
      );
    const mediatorReplacementCalls: number[] = [];
    const mediatorReplacementLeader = new (class extends RpcTarget {
      async listSessionBackups(props: { backupClientId: number }) {
        mediatorReplacementCalls.push(props.backupClientId);
        return encodeSuccess([]);
      }
    })();
    const mediatorReplacementLeaderChannel = new MessageChannel();
    mediatorReplacementLeaderChannel.port1.start();
    const mediatorReplacementLeaderSession = newMessagePortRpcSession(
      mediatorReplacementLeaderChannel.port1,
      mediatorReplacementLeader,
    );
    replacementControl.port2.postMessage(
      {
        type: 'InstallLeader',
        port: mediatorReplacementLeaderChannel.port2,
      },
      [mediatorReplacementLeaderChannel.port2],
    );
    await expect(
      replacementClient.listSessionBackups({ backupKey: 'c'.repeat(64) }),
    ).resolves.toEqual({ _tag: 'Success', success: [] });
    expect(mediatorReplacementCalls).toEqual([1]);

    replacementClient[Symbol.dispose]();
    replacementClientChannel.port2.close();
    mediatorReplacementLeaderSession[Symbol.dispose]();
    mediatorReplacementLeaderChannel.port1.close();
    replacementControl.port2.close();
  });
});
