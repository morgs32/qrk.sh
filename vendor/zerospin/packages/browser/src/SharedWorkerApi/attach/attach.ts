import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import {
  catchZerospinError,
  isZerospinError,
  makeZerospinError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { RpcStub } from 'capnweb';
import { Effect } from 'effect';

import type { IBrowserSessionApi } from '../../BrowserSessionApi/BrowserSessionApi.ts';
import type { SharedWorkerApi } from '../SharedWorkerApi.ts';

export const attach: (props: {
  api: SharedWorkerApi;
  input: unknown;
  target: RpcStub<() => Promise<IAdmissionRequest>>;
}) => Effect.Effect<IResult<RpcStub<IBrowserSessionApi>, IZerospinErrorJson>> =
  Effect.fn('SharedWorkerApi.attach')(function* (props: {
    api: SharedWorkerApi;
    input: unknown;
    target: RpcStub<() => Promise<IAdmissionRequest>>;
  }): Effect.fn.Return<
    IResult<RpcStub<IBrowserSessionApi>, IZerospinErrorJson>
  > {
    const { api, input, target: admission } = props;
    return yield* Effect.tryPromise({
      try: async () => {
        const target = admission.dup();
        try {
          const attached = await api.runtime.attach(input, () =>
            Promise.resolve(target()),
          );
          if (api.disposed) {
            attached[Symbol.dispose]();
            throw makeZerospinError({ code: 'node-tab-detached' });
          }
          let closed = false;
          const detach = attached.detach;
          const close = () => {
            if (closed) return;
            closed = true;
            detach?.();
            attached[Symbol.dispose]();
            target[Symbol.dispose]();
            api.connections.delete(close);
          };
          attached.detach = close;
          api.connections.add(close);
          return new RpcStub<IBrowserSessionApi>(attached);
        } catch (error) {
          target[Symbol.dispose]();
          throw error;
        }
      },
      // Only unclassified failures inside worker attachment receive this fallback.
      catch: cause =>
        isZerospinError(cause)
          ? cause
          : catchZerospinError({ code: 'node-attachment-failed' })(cause),
    }).pipe(encodeRpcOutcome);
  });
