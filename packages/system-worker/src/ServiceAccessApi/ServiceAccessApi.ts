import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import type { ISystem } from '@zerospin/core/system/types';
import { RpcTarget } from 'capnweb';

import { authorize } from './authorize/authorize.js';

/** Verified service claims, retained privately for definition admission. */
export class ServiceAccessApi extends RpcTarget {
  readonly #access: Parameters<typeof authorize>[0]['access'];
  readonly #runtime: ISystem['runtime'];
  constructor(props: {
    access: Parameters<typeof authorize>[0]['access'];
    runtime: ISystem['runtime'];
  }) {
    super();
    this.#access = props.access;
    this.#runtime = props.runtime;
  }
  async authorize(request: {
    sessionName: string;
    serviceSessionLock: IServiceSessionLock;
  }) {
    return this.#runtime.runPromise(
      authorize({ request, access: this.#access, runtime: this.#runtime }),
    );
  }
}
