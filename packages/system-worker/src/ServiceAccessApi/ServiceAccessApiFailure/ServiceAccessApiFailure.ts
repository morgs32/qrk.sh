import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { ServiceAccessApi } from '../ServiceAccessApi.js';

import { authorize } from './authorize/authorize.js';

export class ServiceAccessApiFailure extends RpcTarget {
  readonly #error: IAnyError;
  constructor(error: IAnyError) {
    super();
    this.#error = error;
  }
  async authorize(_request: Parameters<ServiceAccessApi['authorize']>[0]) {
    return Effect.runPromise(authorize({ error: this.#error }));
  }
}
