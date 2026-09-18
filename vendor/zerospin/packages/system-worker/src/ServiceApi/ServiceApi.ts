import { RpcTarget } from 'capnweb';

import type { ISystemRuntime } from '../makeSystemRuntime.js';

import { authenticate } from './authenticate/authenticate.js';

/** Authentication capability for one service version. */
export class ServiceApi extends RpcTarget {
  readonly #binding: Parameters<typeof authenticate>[0]['binding'];
  readonly #runtime: ISystemRuntime;
  constructor(props: {
    binding: Parameters<typeof authenticate>[0]['binding'];
    runtime: ISystemRuntime;
  }) {
    super();
    this.#binding = props.binding;
    this.#runtime = props.runtime;
  }
  async authenticate(request: { signature: unknown }) {
    return this.#runtime.runPromise(
      authenticate({ request, binding: this.#binding, runtime: this.#runtime }),
    );
  }
}
