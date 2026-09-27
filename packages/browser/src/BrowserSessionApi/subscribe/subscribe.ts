import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { catchZerospinError, makeZerospinError } from '@zerospin/error';
import type { RpcStub } from 'capnweb';
import { Effect } from 'effect';

import type { Node } from '../../Node/Node.ts';
import type { BrowserSessionApi } from '../BrowserSessionApi.ts';

export const subscribe = Effect.fn('BrowserSessionApi.subscribe')(
  function* (props: {
    api: BrowserSessionApi;
    receive: RpcStub<Parameters<Node['subscribe']>[0]>;
  }) {
    const { api, receive } = props;
    return yield* Effect.gen(function* () {
      if (!api.isCurrent()) {
        return yield* makeZerospinError({ code: 'node-signed-out' });
      }
      if (api.detached) {
        return yield* makeZerospinError({ code: 'node-tab-detached' });
      }
      const generation = ++api.subscriptionGeneration;
      api.unsubscribe?.();
      const retained = receive.dup();
      const unsubscribe = yield* Effect.tryPromise({
        try: async () => {
          try {
            const detach = await api.node.subscribe(async change => {
              if (!api.isCurrent()) {
                if (
                  change.type === 'state' &&
                  change.state.authentication === 'signed-out'
                ) {
                  await retained(change);
                  api.unsubscribe?.();
                  api.unsubscribe = null;
                }
                return;
              }
              await retained(change);
            });
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
  },
);
