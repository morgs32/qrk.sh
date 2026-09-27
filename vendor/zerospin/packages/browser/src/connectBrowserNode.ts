import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import {
  makeZerospinError,
  type IAnyError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { newMessagePortRpcSession, RpcStub } from 'capnweb';

import type { IBrowserNode } from './BrowserNode/BrowserNode.ts';
import { isNodeNetworkUnavailable } from './Node/isNodeNetworkUnavailable.ts';
import type { INodeChange, INodeSnapshot } from './Node/Node.ts';
import type { INodeRequest } from './Node/nodeRequest.ts';
import type { NodeWorker } from './NodeWorker/NodeWorker.ts';

export function nodeResult<A>(
  result: IResult<A, IAnyError | IZerospinErrorJson>,
): A {
  if (result._tag === 'Failure') throw makeZerospinError(result.failure);
  return result.success;
}

export type INodeConnection = {
  readonly node: RpcStub<IBrowserNode>;
  ready(): Promise<void>;
  resnapshot(): Promise<void>;
  dispose(): Promise<void>;
};

export async function connectBrowserNode(props: {
  request: INodeRequest;
  getAdmission(): Promise<
    IResult<IAdmissionRequest, IAnyError | IZerospinErrorJson>
  >;
  expectedIdentity?: Readonly<Record<string, unknown>> | undefined;
  receive(snapshot: INodeSnapshot): Promise<void>;
  state(state: INodeSnapshot['state']): void;
  reconnect(): Promise<void>;
}): Promise<INodeConnection> {
  let disposed = false;
  let api: RpcStub<NodeWorker> | null = null;
  let node: RpcStub<IBrowserNode> | null = null;
  let port: MessagePort | null = null;
  let callback: RpcStub<(change: INodeChange) => Promise<void>> | null = null;
  let generation = 0;
  let opening: Promise<void> | null = null;
  let lifetime: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const admission = new RpcStub(async () =>
    nodeResult(await props.getAdmission()),
  );

  const closeConnection = () => {
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
      const worker = new SharedWorker('/__zerospin/node-worker.js', {
        name: 'zerospin-nodes',
        type: 'module',
      });
      port = worker.port;
      const connection = newMessagePortRpcSession<NodeWorker>(port);
      api = connection;
      const ready = Promise.withResolvers<void>();
      void ready.promise.catch(() => undefined);
      let broken = false;
      const lost = () => {
        if (disposed || generation !== current || broken) return;
        broken = true;
        ready.reject(
          makeZerospinError({ code: 'node-connection-unavailable' }),
        );
        connection[Symbol.dispose]();
        props.state({
          retainedNodes: [],
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
      connection.onRpcBroken(lost);
      worker.addEventListener('error', lost);
      port.addEventListener('messageerror', lost);
      port.start();
      nodeResult(await connection.ready());
      lifetime = new AbortController();
      void navigator.locks
        .request(
          'zerospin-nodes-lifetime',
          { mode: 'shared', signal: lifetime.signal },
          lost,
        )
        .catch(() => undefined);
      const attached = nodeResult(
        await connection.attach(
          props.request,
          admission,
          props.expectedIdentity,
        ),
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
      await props.reconnect();
    })();
    opening = work;
    void work
      .catch(error => {
        if (
          disposed ||
          generation !== current ||
          isNodeNetworkUnavailable(error)
        ) {
          return;
        }
        props.state({
          retainedNodes: [],
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
