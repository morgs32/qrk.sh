import type {
  AggregateNode,
  IAggregateNodeSnapshot,
} from '@zerospin/core/AggregateNode/AggregateNode';
import type { IAggregateStagedCommand } from '@zerospin/core/AggregateNode/types';
import type { IAggregateBrowserCommand } from '@zerospin/core/aggregateSession/types';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import {
  makeZerospinError,
  type IAnyError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { newMessagePortRpcSession, RpcStub } from 'capnweb';

import { admissionValue } from '../Node/admissionValue.ts';
import { isNodeNetworkUnavailable } from '../Node/isNodeNetworkUnavailable.ts';
import { publicRpcError, restoreRpcError } from '../Node/publicRpcError.ts';
import { makeAggregateSharedWorkerName } from '../sharedWorkerNames.ts';
import { sharedWorkerVersion } from '../sharedWorkerVersion.ts';

import type { IAggregateBrowserSessionApi } from './AggregateBrowserSessionApi.ts';
import type { IAggregateNodeRequest } from './aggregateNodeRequest.ts';
import { aggregateSessionDiscovery } from './aggregateSessionDiscovery.ts';
import type { AggregateSharedWorkerApi } from './AggregateSharedWorkerApi.ts';
import { resolveAggregateNode } from './resolveAggregateNode.ts';

export type IAggregateNodeConnection = {
  readonly node: RpcStub<IAggregateBrowserSessionApi>;
  ready(): Promise<void>;
  dispose(): Promise<void>;
};

export async function connectAggregateNode(props: {
  sharedWorker: (props: { name: string }) => SharedWorker;
  request: IAggregateNodeRequest;
  getAdmission(): Promise<
    IResult<IAdmissionRequest, IAnyError | IZerospinErrorJson>
  >;
  expectedClaims?: Readonly<Record<string, unknown>> | undefined;
  initialize(snapshot: IAggregateNodeSnapshot): Promise<void>;
  commands(
    commands: readonly (IAggregateStagedCommand | IAggregateBrowserCommand)[],
    throughChangeIndex: number,
  ): Promise<void>;
  state(state: IAggregateNodeSnapshot['state']): void;
  sharedWorkerConnectionFailure(failure: { message: string }): void;
  reconnect(): Promise<void>;
}): Promise<IAggregateNodeConnection> {
  let disposed = false;
  let api: RpcStub<AggregateSharedWorkerApi> | null = null;
  let node: RpcStub<IAggregateBrowserSessionApi> | null = null;
  let port: MessagePort | null = null;
  let callback: RpcStub<Parameters<AggregateNode['subscribe']>[1]> | null =
    null;
  let afterChangeIndex: number | undefined;
  let generation = 0;
  let opening: Promise<void> | null = null;
  let lifetime: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let revision: number | undefined;
  let selectedKey: string | undefined;
  let verifiedAdmission: IAdmissionRequest | null = null;
  let lastState: IAggregateNodeSnapshot['state'] | null = null;
  let removeListeners = () => {};
  const admission = new RpcStub(async () => {
    if (verifiedAdmission !== null) {
      const value = verifiedAdmission;
      verifiedAdmission = null;
      return value;
    }
    return admissionValue(await props.getAdmission());
  });

  const closeConnection = () => {
    removeListeners();
    removeListeners = () => {};
    lifetime?.abort();
    lifetime = null;
    callback?.[Symbol.dispose]();
    callback = null;
    node?.[Symbol.dispose]();
    node = null;
    api?.[Symbol.dispose]();
    api = null;
    port?.close();
    port = null;
  };
  const open = () => {
    if (disposed) {
      return Promise.reject(makeZerospinError({ code: 'node-tab-detached' }));
    }
    if (opening !== null) return opening;
    const current = ++generation;
    const reconnecting = afterChangeIndex !== undefined;
    let attachingSharedWorker = false;
    const work = (async () => {
      closeConnection();
      revision ??= await aggregateSessionDiscovery.revision();
      const resolved = await resolveAggregateNode({
        request: props.request,
        getAdmission: async () => admissionValue(await props.getAdmission()),
        expectedClaims: props.expectedClaims,
        revision,
      });
      if (disposed || generation !== current) return;
      const key = await sessionKey(resolved.definition.identity);
      if (selectedKey !== undefined && selectedKey !== key) {
        throw makeZerospinError({
          code: 'node-authentication-identity-mismatch',
        });
      }
      selectedKey = key;
      verifiedAdmission = resolved.admission;
      const name = makeAggregateSharedWorkerName(key);
      attachingSharedWorker = true;
      const worker = props.sharedWorker({ name });
      port = worker.port;
      const connection = newMessagePortRpcSession<AggregateSharedWorkerApi>(
        port,
        undefined,
        { onSendError: publicRpcError },
      );
      api = connection;
      const ready = Promise.withResolvers<void>();
      void ready.promise.catch(() => undefined);
      let broken = false;
      let retired = false;
      const lost = () => {
        if (disposed || generation !== current || broken || retired) return;
        broken = true;
        ready.reject(
          makeZerospinError({ code: 'node-connection-unavailable' }),
        );
        connection[Symbol.dispose]();
        props.state({
          localAvailability: 'unavailable',
          authentication: 'unavailable',
          synchronization: 'offline',
          blockedWork: lastState?.blockedWork ?? false,
          failure: lastState?.failure ?? null,
          admissionRejection: lastState?.admissionRejection ?? null,
        });
        if (timer === null) {
          timer = setTimeout(() => {
            timer = null;
            void open().catch(() => undefined);
          }, 250);
        }
      };
      const startupTimeout = setTimeout(lost, 15000);
      connection.onRpcBroken(lost);
      worker.addEventListener('error', lost);
      port.addEventListener('messageerror', lost);
      const currentPort = port;
      removeListeners = () => {
        retired = true;
        clearTimeout(startupTimeout);
        worker.removeEventListener('error', lost);
        currentPort.removeEventListener('messageerror', lost);
      };
      port.start();
      const workerReady = await connection.ready().catch(restoreRpcError);
      if (workerReady.version !== sharedWorkerVersion) {
        throw makeZerospinError({ code: 'node-worker-version-mismatch' });
      }
      lifetime = new AbortController();
      void navigator.locks
        .request(
          `${name}:lifetime`,
          { mode: 'shared', signal: lifetime.signal },
          lost,
        )
        .catch(() => undefined);
      const attached = await connection
        .attach(resolved.attachment, admission)
        .catch(restoreRpcError);
      if (disposed || generation !== current) {
        attached[Symbol.dispose]();
        return;
      }
      node = attached;
      attachingSharedWorker = false;
      const receive = new RpcStub({
        initialize: async (snapshot: IAggregateNodeSnapshot) => {
          if (disposed || generation !== current) return;
          try {
            await props.initialize(snapshot);
            afterChangeIndex = snapshot.metadata.changeIndex;
            lastState = snapshot.state;
            props.state(snapshot.state);
            ready.resolve();
          } catch (error) {
            ready.reject(error);
            lost();
            throw error;
          }
        },
        commands: async (
          commands: readonly (
            | IAggregateStagedCommand
            | IAggregateBrowserCommand
          )[],
          throughChangeIndex: number,
        ) => {
          if (disposed || generation !== current) return;
          try {
            await props.commands(commands, throughChangeIndex);
            afterChangeIndex = throughChangeIndex;
          } catch (error) {
            ready.reject(error);
            lost();
            throw error;
          }
        },
        state: async (state: IAggregateNodeSnapshot['state']) => {
          if (!disposed && generation === current) {
            lastState = state;
            props.state(state);
          }
        },
      });
      callback = receive;
      await attached
        .subscribe(
          afterChangeIndex === undefined ? {} : { afterChangeIndex },
          receive,
        )
        .catch(restoreRpcError);
      if (afterChangeIndex !== undefined) ready.resolve();
      await ready.promise;
      clearTimeout(startupTimeout);
      if (reconnecting) {
        await props.reconnect();
      }
    })();
    opening = work;
    void work
      .catch(error => {
        if (generation === current) closeConnection();
        if (
          disposed ||
          generation !== current ||
          isNodeNetworkUnavailable(error)
        ) {
          return;
        }
        const code =
          error instanceof Error && 'code' in error ? String(error.code) : null;
        if (
          code !== null &&
          [
            'node-connection-unavailable',
            'node-tab-detached',
            'node-admission-unavailable',
            'node-authentication-unavailable',
            'node-authentication-cancelled',
            'node-signed-out',
          ].includes(code)
        )
          return;
        const authenticationRejected =
          (error instanceof Error &&
            'status' in error &&
            (error.status === 401 || error.status === 403)) ||
          [
            'node-authentication-rejected',
            'authentication-credentials-invalid',
            'admission-credentials-required',
            'node-authentication-identity-mismatch',
            'session-claims-mismatch',
          ].includes(String(code));
        const message = error instanceof Error ? error.message : String(error);
        const persistenceFailed = code?.startsWith('node-storage-') === true;
        if (
          attachingSharedWorker &&
          !authenticationRejected &&
          !persistenceFailed
        ) {
          props.sharedWorkerConnectionFailure({ message });
        }
        props.state({
          localAvailability: persistenceFailed
            ? 'failed'
            : attachingSharedWorker
              ? 'unavailable'
              : 'available',
          authentication: authenticationRejected ? 'rejected' : 'unavailable',
          synchronization: 'blocked',
          blockedWork: true,
          failure: message,
          admissionRejection: null,
        });
      })
      .finally(() => {
        if (opening === work) opening = null;
      })
      .catch(() => undefined);
    return work;
  };
  const resume = () => {
    if (!disposed && document.visibilityState !== 'hidden') {
      void (node === null ? open() : node.resume()).catch(() => undefined);
    }
  };
  window.addEventListener('online', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  // Reconnection keeps the tab SQLite projection and committed delivery cursor.
  const connection = {
    get node() {
      if (node === null) {
        throw makeZerospinError({ code: 'node-connection-unavailable' });
      }
      return node;
    },
    ready: open,
    dispose: async () => {
      disposed = true;
      generation += 1;
      window.removeEventListener('online', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
      if (timer !== null) clearTimeout(timer);
      await node?.dispose().catch(() => undefined);
      closeConnection();
      admission[Symbol.dispose]();
    },
  };
  return connection;
}
