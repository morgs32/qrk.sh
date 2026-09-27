import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { ISystem, ISystemId } from '@zerospin/core/system/types';
import type { IRpcRequest } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getActorCommands } from './getActorCommands/getActorCommands.js';
import { getSnapshot } from './getSnapshot/getSnapshot.js';
import { validateActorCommand } from './validateActorCommand/validateActorCommand.js';

export class AggregateSessionApi extends RpcTarget {
  readonly #authResults: {
    readonly aggregateId: IAggregateId;
    readonly aggregateName: string;
    aggregateVersion: string;
    readonly identity: Readonly<Record<string, unknown>>;
    actorName: string;
    actorVersion: string;
    readonly actorPath: string;
    readonly sessionName: string;
    readonly aggregateSessionLock: IAggregateSessionLock;
    readonly systemId: ISystemId;
  };
  readonly #runtime: ISystem['runtime'];

  /*
   * Constructs AggregateSessionApi with its bound runtime and instance state.
   *
   * 1. Initialize and bind the instance.
   */
  constructor(props: {
    authResults: {
      readonly aggregateId: IAggregateId;
      readonly aggregateName: string;
      aggregateVersion: string;
      readonly identity: Readonly<Record<string, unknown>>;
      actorName: string;
      actorVersion: string;
      readonly actorPath: string;
      readonly sessionName: string;
      readonly aggregateSessionLock: IAggregateSessionLock;
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
   * AggregateSessionApi serves reconnect history from AggregateActorVersionChain.
   * The capability binds the definition identity; the request supplies the replay
   * cursor and aggregateVersion.
   *
   * 1. Run the bound domain operation.
   */
  async validateActorCommand(
    request: IRpcRequest<[{ contractName: string; payload: unknown }]>,
  ) {
    return this.#runtime.runPromise(
      validateActorCommand({ request, authResults: this.#authResults }),
    );
  }

  async getActorCommands(
    request: IRpcRequest<
      [{ afterExecutedIndex: number; aggregateVersion: string }]
    >,
  ) {
    // 1 — run getActorCommands with the instance-bound dependencies
    return this.#runtime.runPromise(
      getActorCommands({ request, authResults: this.#authResults }),
    );
  }

  /*
   * The aggregate definition capability requests a named service query with its
   * admitted definition lock. The worker query path requires complete definition context
   * and runs the named query in the requested service.
   *
   * 1. Run the bound domain operation.
   */
  async executeServiceQuery(
    request: IRpcRequest<
      [{ serviceName: string; queryName: string; params: unknown }]
    >,
  ) {
    // 1 — run executeServiceQuery with the instance-bound dependencies
    return this.#runtime.runPromise(
      executeServiceQuery({ request, authResults: this.#authResults }),
    );
  }

  /*
   * The aggregate definition capability selects the current base version and
   * requests its user/definition snapshot from ReplicaRepo. The Replica
   * Repo owns catch-up and projected state.
   *
   * 1. Run the bound domain operation.
   */
  async getSnapshot(request: IRpcRequest<[{ nodeId: string | null }]>) {
    // 1 — run getSnapshot with the instance-bound dependencies
    return this.#runtime.runPromise(
      getSnapshot({ request, authResults: this.#authResults }),
    );
  }

  /*
   * The aggregate definition capability requests a ticket for a caller-selected
   * aggregateVersion, using its bound aggregate, user, definition, and system fields.
   * SystemRepo owns ticket persistence and later consumption.
   *
   * 1. Run the bound domain operation.
   */
  async createWebSocketTicket(
    request: IRpcRequest<[{ aggregateVersion: string }]>,
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
