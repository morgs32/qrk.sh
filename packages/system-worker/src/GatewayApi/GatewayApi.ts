import { RpcTarget } from 'capnweb';

import type { ISystemRuntime } from '../makeSystemRuntime.js';
import type { SystemApi } from '../SystemApi/SystemApi.js';
import type { SystemApiFailure } from '../SystemApi/SystemApiFailure/SystemApiFailure.js';

import { aggregate } from './aggregate/aggregate.js';
import { getSystemApi } from './getSystemApi/getSystemApi.js';
import { service } from './service/service.js';

/** Public root for aggregate, service, and secret-key system capabilities. */
export class GatewayApi extends RpcTarget {
  readonly #runtime: ISystemRuntime;
  constructor(props: { runtime: ISystemRuntime }) {
    super();
    this.#runtime = props.runtime;
  }
  async aggregate(request: Parameters<typeof aggregate>[0]['request']) {
    return this.#runtime.runPromise(
      aggregate({ request, runtime: this.#runtime }),
    );
  }
  async service(request: Parameters<typeof service>[0]['request']) {
    return this.#runtime.runPromise(
      service({ request, runtime: this.#runtime }),
    );
  }
  /*
   * GatewayApi grants the deployment-scoped SystemApi to secret-key callers.
   * Admission errors become a failure capability with the same callable surface.
   *
   * 1. Run the bound domain operation.
   */
  async getSystemApi(props: {
    zerospinSecretKey: string;
  }): Promise<SystemApi | SystemApiFailure> {
    // 1 — run getSystemApi with the instance-bound dependencies
    return this.#runtime.runPromise(
      getSystemApi({
        request: props,
        runtime: this.#runtime,
      }),
    );
  }
}
