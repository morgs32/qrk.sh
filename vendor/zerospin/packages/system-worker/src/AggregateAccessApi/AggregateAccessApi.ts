import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { ISystem } from '@zerospin/core/system/types';
import { RpcTarget } from 'capnweb';

import { authorize } from './authorize/authorize.js';

/** Verified aggregate identity, retained privately for definition admission. */
export class AggregateAccessApi extends RpcTarget {
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
    aggregateSessionLock: IAggregateSessionLock;
  }) {
    return this.#runtime.runPromise(
      authorize({ request, access: this.#access, runtime: this.#runtime }),
    );
  }
}
