import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { catchZerospinError, makeZerospinError } from '@zerospin/error';
import type { RpcStub } from 'capnweb';
import { Effect } from 'effect';

import type { Node } from '../../Node/Node.ts';
import type { BrowserNode } from '../BrowserNode.ts';

export const subscribe = Effect.fn('BrowserNode.subscribe')(function* (props: {
  api: BrowserNode;
  receive: RpcStub<Parameters<Node['subscribe']>[0]>;
}) {
  const { api, receive } = props;
  return yield* Effect.gen(function* () {
    if (api.detached) {
      return yield* makeZerospinError({ code: 'node-tab-detached' });
    }
    const generation = ++api.subscriptionGeneration;
    api.unsubscribe?.();
    const retained = receive.dup();
    const unsubscribe = yield* Effect.tryPromise({
      try: async () => {
        try {
          const detach = await api.node.subscribe(change =>
            Promise.resolve(retained(change)),
          );
          return () => {
            detach();
            retained[Symbol.dispose]();
          };
        } catch (error) {
          retained[Symbol.dispose]();
          throw error;
        }
      },
      catch: catchZerospinError({ code: 'node-subscription-failed' }),
    });
    if (api.detached || generation !== api.subscriptionGeneration) {
      unsubscribe();
    } else {
      api.unsubscribe = unsubscribe;
    }
  }).pipe(encodeRpcOutcome);
});
