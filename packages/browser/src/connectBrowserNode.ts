import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import type { INodeChange, INodeSnapshot } from '@zerospin/core/Node/Node';
import { nodeKey } from '@zerospin/core/Node/nodeKey';
import {
  makeZerospinError,
  type IAnyError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { newMessagePortRpcSession, RpcStub } from 'capnweb';

import type { IBrowserSessionApi } from './BrowserSessionApi/BrowserSessionApi.ts';
import { isNodeNetworkUnavailable } from './Node/isNodeNetworkUnavailable.ts';
import type { INodeRequest } from './Node/nodeRequest.ts';
import { resolveNode } from './Node/resolveNode.ts';
import { sessionDiscovery } from './Node/sessionDiscovery.ts';
import type { SharedWorkerApi } from './SharedWorkerApi/SharedWorkerApi.ts';
import { sharedWorkerVersion } from './sharedWorkerVersion.ts';

export function nodeResult<A>(
  result: IResult<A, IAnyError | IZerospinErrorJson>,
): A {
  if (result._tag === 'Failure') throw makeZerospinError(result.failure);
  return result.success;
}

export type INodeConnection = {
  readonly node: RpcStub<IBrowserSessionApi>;
  ready(): Promise<void>;
  resnapshot(): Promise<void>;
  dispose(): Promise<void>;
};

export async function connectBrowserNode(props: {
  sharedWorker: (props: { name: string }) => SharedWorker;
  request: INodeRequest;
  getAdmission(): Promise<
    IResult<IAdmissionRequest, IAnyError | IZerospinErrorJson>
  >;
  expectedClaims?: Readonly<Record<string, unknown>> | undefined;
  receive(snapshot: INodeSnapshot): Promise<void>;
  state(state: INodeSnapshot['state']): void;
  reconnect(): Promise<void>;
}): Promise<INodeConnection> {
  let disposed = false;
  let api: RpcStub<SharedWorkerApi> | null = null;
  let node: RpcStub<IBrowserSessionApi> | null = null;
  let port: MessagePort | null = null;
  let callback: RpcStub<(change: INodeChange) => Promise<void>> | null = null;
  let generation = 0;
  let opening: Promise<void> | null = null;
  let lifetime: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let revision: number | undefined;
  let selectedKey: string | undefined;
  let verifiedAdmission: IAdmissionRequest | null = null;
  let removeListeners = () => {};
  const admission = new RpcStub(async () => {
    if (verifiedAdmission !== null) {
      const value = verifiedAdmission;
      verifiedAdmission = null;
      return value;
    }
    return nodeResult(await props.getAdmission());
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
    const work = (async () => {
      closeConnection();
      revision ??= await sessionDiscovery.revision();
      const resolved = await resolveNode({
        request: props.request,
        getAdmission: async () => nodeResult(await props.getAdmission()),
        expectedClaims: props.expectedClaims,
        revision,
      });
      if (disposed || generation !== current) return;
      const key = await nodeKey(resolved.definition.identity);
      if (selectedKey !== undefined && selectedKey !== key) {
        throw makeZerospinError({
          code: 'node-authentication-identity-mismatch',
        });
      }
      selectedKey = key;
      verifiedAdmission = resolved.admission;
      const name = `zerospin:${sharedWorkerVersion}:${key}`;
      const worker = props.sharedWorker({ name });
      port = worker.port;
      const connection = newMessagePortRpcSession<SharedWorkerApi>(port);
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
          blockedWork: false,
          failure: null,
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
      const workerReady = nodeResult(await connection.ready());
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
      const attached = nodeResult(
        await connection.attach(resolved.attachment, admission),
      );
      if (disposed || generation !== current) {
        attached[Symbol.dispose]();
        return;
      }
      node = attached;
      const receive = new RpcStub(async (change: INodeChange) => {
        if (disposed || generation !== current) return;
        try {
          if (change.type === 'state') {
            props.state(change.state);
            return;
          }
          const snapshot =
            change.type === 'snapshot'
              ? change.snapshot
              : nodeResult(await attached.snapshot());
          await props.receive(snapshot);
          props.state(snapshot.state);
          ready.resolve();
        } catch (error) {
          ready.reject(error);
          lost();
          throw error;
        }
      });
      callback = receive;
      nodeResult(await attached.subscribe(receive));
      await ready.promise;
      clearTimeout(startupTimeout);
      await props.reconnect();
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
        props.state({
          localAvailability: 'unavailable',
          authentication: 'unavailable',
          synchronization: 'blocked',
          blockedWork: true,
          failure: String(error),
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
  // reconnect's caller reads the mutable capability after a fresh snapshot.
  const connection = {
    get node() {
      if (node === null) {
        throw makeZerospinError({ code: 'node-connection-unavailable' });
      }
      return node;
    },
    ready: open,
    resnapshot: async () => {
      if (node !== null) await props.receive(nodeResult(await node.snapshot()));
    },
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
