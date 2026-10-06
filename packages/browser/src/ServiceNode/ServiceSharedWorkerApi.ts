import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { makeZerospinError } from '@zerospin/error';
import { RpcStub, RpcTarget } from 'capnweb';

import type {
  IServiceBrowserSessionApi,
  ServiceBrowserSessionApi,
} from './ServiceBrowserSessionApi.ts';
export class ServiceSharedWorkerApi extends RpcTarget {
  #disposed = false;
  #connections = new Set<() => void>();
  #runtime;
  constructor(runtime: {
    ready(): Promise<{ version: string }>;
    attach(
      input: unknown,
      getAdmission: () => Promise<IAdmissionRequest>,
    ): Promise<ServiceBrowserSessionApi>;
  }) {
    super();
    this.#runtime = runtime;
  }
  async ready() {
    if (this.#disposed) throw makeZerospinError({ code: 'node-tab-detached' });
    return this.#runtime.ready();
  }
  async attach(
    input: unknown,
    admission: RpcStub<() => Promise<IAdmissionRequest>>,
  ): Promise<RpcStub<IServiceBrowserSessionApi>> {
    const provider = admission.dup();
    try {
      const attached = await this.#runtime.attach(input, () =>
        Promise.resolve(provider()),
      );
      if (this.#disposed) {
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
        provider[Symbol.dispose]();
        this.#connections.delete(close);
      };
      attached.detach = close;
      this.#connections.add(close);
      return new RpcStub<IServiceBrowserSessionApi>(attached);
    } catch (error) {
      provider[Symbol.dispose]();
      throw error;
    }
  }
  [Symbol.dispose]() {
    this.#disposed = true;
    for (const close of this.#connections) close();
    this.#connections.clear();
  }
}
