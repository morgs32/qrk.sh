import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { AggregateAccessApi } from '../AggregateAccessApi.js';

import { authorize } from './authorize/authorize.js';

export class AggregateAccessApiFailure extends RpcTarget {
  readonly #error: IAnyError;
  constructor(error: IAnyError) {
    super();
    this.#error = error;
  }
  async authorize(_request: Parameters<AggregateAccessApi['authorize']>[0]) {
    return Effect.runPromise(authorize({ error: this.#error }));
  }
}
