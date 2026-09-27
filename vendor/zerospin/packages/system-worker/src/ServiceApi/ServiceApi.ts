import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import type { ISystem } from '@zerospin/core/system/types';
import { RpcTarget } from 'capnweb';

import { admit } from './admit/admit.js';

/** Identity capability for one service version. */
export class ServiceApi extends RpcTarget {
  readonly #binding: Parameters<typeof admit>[0]['binding'];
  readonly #runtime: ISystem['runtime'];
  constructor(props: {
    binding: Parameters<typeof admit>[0]['binding'];
    runtime: ISystem['runtime'];
  }) {
    super();
    this.#binding = props.binding;
    this.#runtime = props.runtime;
  }
  async admit(
    request: IAdmissionRequest & {
      actorName: string;
      actorVersion: string;
    },
  ) {
    return this.#runtime.runPromise(
      admit({ request, binding: this.#binding, runtime: this.#runtime }),
    );
  }
}
