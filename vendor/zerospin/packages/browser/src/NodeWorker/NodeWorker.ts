import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import type { IResult, IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget, type RpcStub } from 'capnweb';
import { Effect } from 'effect';

import type { IBrowserNode } from '../BrowserNode/BrowserNode.ts';
import type { NodeHost } from '../Node/NodeHost.ts';

import { attach } from './attach/attach.ts';
import { ready } from './ready/ready.ts';

export class NodeWorker extends RpcTarget {
  readonly connections = new Set<() => void>();
  constructor(readonly host: Promise<NodeHost>) {
    super();
  }
  async ready() {
    return Effect.runPromise(ready({ api: this }));
  }
  async attach(
    input: unknown,
    target: RpcStub<() => Promise<IAdmissionRequest>>,
    expectedClaims?: Readonly<Record<string, unknown>>,
  ): Promise<IResult<RpcStub<IBrowserNode>, IZerospinErrorJson>> {
    return Effect.runPromise(
      attach({ api: this, input, target, expectedClaims }),
    );
  }
  [Symbol.dispose](): void {
    for (const close of this.connections) close();
    this.connections.clear();
  }
}
