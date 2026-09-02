import type { ZerospinError } from '@zerospin/error';
import type { ILinkedRpcEnvelope, IRpcRequest } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import { executeRpc } from './executeRpc.ts';

declare class ChildApi extends RpcTarget {
  getName(request: IRpcRequest<[]>): Promise<ILinkedRpcEnvelope<string, never>>;
  getCount(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<number, never>>;
}

declare class Apis extends RpcTarget {
  getChildApi(): Promise<ChildApi>;
}

const nameEffect: Effect.Effect<
  string,
  ZerospinError<'async-failed'>
> = executeRpc<Apis>('http://localhost/rpc')(apis =>
  apis.getChildApi().getName(),
);
void nameEffect;

const tupleEffect: Effect.Effect<
  [string, number],
  ZerospinError<'async-failed'>
> = executeRpc<Apis>('http://localhost/rpc')(apis => {
  const childApi = apis.getChildApi();
  return Effect.all([childApi.getName(), childApi.getCount()], {
    concurrency: 'unbounded',
  });
});
void tupleEffect;

void executeRpc<Apis>('http://localhost/rpc')(
  // @ts-expect-error executeRpc requires a synchronous batching callback
  async apis => apis.getChildApi().getName(),
);
