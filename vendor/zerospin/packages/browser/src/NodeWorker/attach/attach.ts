import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import {
  catchZerospinError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { RpcStub } from 'capnweb';
import { Effect } from 'effect';

import {
  BrowserNode,
  type IBrowserNode,
} from '../../BrowserNode/BrowserNode.ts';
import type { NodeWorker } from '../NodeWorker.ts';

export const attach: (props: {
  api: NodeWorker;
  input: unknown;
  target: RpcStub<() => Promise<IAdmissionRequest>>;
  expectedClaims?: Readonly<Record<string, unknown>> | undefined;
}) => Effect.Effect<IResult<RpcStub<IBrowserNode>, IZerospinErrorJson>> =
  Effect.fn('NodeWorker.attach')(function* (props: {
    api: NodeWorker;
    input: unknown;
    target: RpcStub<() => Promise<IAdmissionRequest>>;
    expectedClaims?: Readonly<Record<string, unknown>> | undefined;
  }): Effect.fn.Return<
    IResult<RpcStub<IBrowserNode>, IZerospinErrorJson>,
    never
  > {
    return yield* Effect.tryPromise({
      try: async () => {
        const target = props.target.dup();
        try {
          const host = await props.api.host;
          const hosted = await host.attach(
            props.input,
            target,
            () => Promise.resolve(target()),
            props.expectedClaims,
          );
          const close = () => {
            hosted.detach();
            target[Symbol.dispose]();
            props.api.connections.delete(close);
          };
          props.api.connections.add(close);
          return new RpcStub<IBrowserNode>(
            new BrowserNode(
              hosted.node,
              hosted.synchronization,
              hosted.clearAuthentication,
              close,
            ),
          );
        } catch (error) {
          target[Symbol.dispose]();
          throw error;
        }
      },
      catch: catchZerospinError({ code: 'node-attachment-failed' }),
    }).pipe(encodeRpcOutcome);
  });
