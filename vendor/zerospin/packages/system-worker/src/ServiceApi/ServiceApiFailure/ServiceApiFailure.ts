import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { ServiceApi } from '../ServiceApi.js';

import { admit } from './admit/admit.js';

export class ServiceApiFailure extends RpcTarget {
  readonly #error: IAnyError;
  constructor(error: IAnyError) {
    super();
    this.#error = error;
  }
  async admit(_request: Parameters<ServiceApi['admit']>[0]) {
    return Effect.runPromise(admit({ error: this.#error }));
  }
}
