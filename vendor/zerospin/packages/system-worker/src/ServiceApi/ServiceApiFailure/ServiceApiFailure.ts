import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { ServiceApi } from '../ServiceApi.js';

import { authenticate } from './authenticate/authenticate.js';

export class ServiceApiFailure extends RpcTarget {
  readonly #error: IAnyError;
  constructor(error: IAnyError) {
    super();
    this.#error = error;
  }
  async authenticate(_request: Parameters<ServiceApi['authenticate']>[0]) {
    return Effect.runPromise(authenticate({ error: this.#error }));
  }
}
