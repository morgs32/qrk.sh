import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import type { ISystem, ISystemId } from '@zerospin/core/system/types';
import type { IRpcRequest } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { getActorCommands } from './getActorCommands/getActorCommands.js';
import { getSnapshot } from './getSnapshot/getSnapshot.js';

export class ServiceSessionApi extends RpcTarget {
  readonly #authResults: {
    readonly identity: Readonly<Record<string, unknown>>;
    readonly actorPath: string;
    readonly sessionName: string;
    readonly serviceSessionLock: IServiceSessionLock;
    readonly serviceName: string;
    serviceVersion: string;
    readonly systemId: ISystemId;
  };
  readonly #runtime: ISystem['runtime'];

  /*
   * Constructs ServiceSessionApi with its bound runtime and instance state.
   *
   * 1. Initialize and bind the instance.
   */
  constructor(props: {
    authResults: {
      readonly identity: Readonly<Record<string, unknown>>;
      readonly actorPath: string;
      readonly sessionName: string;
      readonly serviceSessionLock: IServiceSessionLock;
      readonly serviceName: string;
      serviceVersion: string;
      readonly systemId: ISystemId;
    };
    runtime: ISystem['runtime'];
  }) {
    // 1 — construct the base and retain the supplied capability state
    super();
    const { authResults, runtime } = props;
    this.#authResults = authResults;
    this.#runtime = runtime;
  }

  /*
   * The service definition capability requests its snapshot from
   * ServiceActorVersionRepo and adapts resources to the exact
   * definition selection. The materializer owns catch-up and the snapshot.
   *
   * 1. Run the bound domain operation.
   */
  async getSnapshot(request: IRpcRequest<[]>) {
    // 1 — run getSnapshot with the instance-bound dependencies
    return this.#runtime.runPromise(
      getSnapshot({ request, authResults: this.#authResults }),
    );
  }

  /*
   * ServiceSessionApi serves reconnect history from ServiceActorVersionChain.
   * The capability binds the definition identity; the request supplies the replay
   * cursor.
   *
   * 1. Run the bound domain operation.
   */
  async getActorCommands(
    request: IRpcRequest<
      [{ afterServiceIndex: number; serviceVersion: string }]
    >,
  ) {
    // 1 — run getActorCommands with the instance-bound dependencies
    return this.#runtime.runPromise(
      getActorCommands({ request, authResults: this.#authResults }),
    );
  }

  /*
   * The service definition capability requests a WebSocket ticket using its
   * bound service, user, definition, and system fields. SystemRepo owns ticket
   * persistence and later consumption.
   *
   * 1. Run the bound domain operation.
   */
  async createWebSocketTicket(
    request: IRpcRequest<[{ serviceVersion: string }]>,
  ) {
    // 1 — run createWebSocketTicket with the instance-bound dependencies
    return this.#runtime.runPromise(
      createWebSocketTicket({
        request,
        authResults: this.#authResults,
      }),
    );
  }
}
