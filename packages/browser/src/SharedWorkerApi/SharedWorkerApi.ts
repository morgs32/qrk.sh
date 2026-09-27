import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import type { IResult, IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget, type RpcStub } from 'capnweb';
import { Effect } from 'effect';

import type {
  BrowserSessionApi,
  IBrowserSessionApi,
} from '../BrowserSessionApi/BrowserSessionApi.ts';

import { attach } from './attach/attach.ts';
import { ready } from './ready/ready.ts';

export class SharedWorkerApi extends RpcTarget {
  disposed = false;
  readonly connections = new Set<() => void>();
  constructor(
    readonly runtime: {
      ready(): Promise<{ version: string }>;
      attach(
        input: unknown,
        getAdmission: () => Promise<IAdmissionRequest>,
      ): Promise<BrowserSessionApi>;
    },
  ) {
    super();
  }

  ready() {
    return Effect.runPromise(ready({ api: this }));
  }
  attach(
    input: unknown,
    target: RpcStub<() => Promise<IAdmissionRequest>>,
  ): Promise<IResult<RpcStub<IBrowserSessionApi>, IZerospinErrorJson>> {
    return Effect.runPromise(attach({ api: this, input, target }));
  }
  [Symbol.dispose](): void {
    this.disposed = true;
    for (const close of this.connections) close();
    this.connections.clear();
  }
}
