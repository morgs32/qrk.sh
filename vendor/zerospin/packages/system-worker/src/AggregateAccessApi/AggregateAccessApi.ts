import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { RpcTarget } from 'capnweb';
import type { Schema } from 'effect';

import type { ISystemRuntime } from '../makeSystemRuntime.js';

import { authorize } from './authorize/authorize.js';

/** Verified aggregate authentication, retained privately for frontend admission. */
export class AggregateAccessApi extends RpcTarget {
  readonly #access: Parameters<typeof authorize>[0]['access'];
  readonly #runtime: ISystemRuntime;
  constructor(props: {
    access: Parameters<typeof authorize>[0]['access'];
    runtime: ISystemRuntime;
  }) {
    super();
    this.#access = props.access;
    this.#runtime = props.runtime;
  }
  async authorize(request: {
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  }) {
    return this.#runtime.runPromise(
      authorize({ request, access: this.#access, runtime: this.#runtime }),
    );
  }
}
