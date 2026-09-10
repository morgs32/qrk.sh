import type {
  IChainedCommand,
  IEncodedCommand,
  ISessionCommand,
} from '@zerospin/core/contracts/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import type {
  IAggregateFrontendFinalizedCommand,
  IAggregateFrontendSyncState,
  IFrontendDelta,
} from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import type { IAnyErrorJson } from '@zerospin/error';
import type { ILinkedRpcEnvelope, IRpcRequest } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import type { Schema } from 'effect';

import type { ISystemRuntime } from '../makeSystemRuntime.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getFinalizedCommands } from './getFinalizedCommands/getFinalizedCommands.js';
import { getState } from './getState/getState.js';
import { pushCommand } from './pushCommand/pushCommand.js';

export class AggregateFrontendApi extends RpcTarget {
  readonly #authResults: {
    readonly aggregateId: IAggregateId;
    readonly aggregateName: string;
    aggregateVersion: string;
    readonly userId: string;
    readonly frontendName: string;
    readonly aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    readonly systemId: ISystemId;
  };
  readonly #runtime: ISystemRuntime;

  /*
   * Constructs AggregateFrontendApi with its bound runtime and instance state.
   *
   * 1. Initialize and bind the instance.
   */
  constructor(props: {
    authResults: {
      readonly aggregateId: IAggregateId;
      readonly aggregateName: string;
      aggregateVersion: string;
      readonly userId: string;
      readonly frontendName: string;
      readonly aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
      readonly systemId: ISystemId;
    };
    runtime: ISystemRuntime;
  }) {
    // 1 — construct the base and retain the supplied capability state
    super();
    const { authResults, runtime } = props;
    this.#authResults = authResults;
    this.#runtime = runtime;
  }

  /*
   * The aggregate frontend capability admits a complete locally committed
   * occurrence into AggregateChain. It returns the admission receipt;
   * version-owned server execution and frontend publication happen downstream.
   *
   * 1. Run the bound domain operation.
   */
  async pushCommand(
    request: IRpcRequest<
      [
        {
          readonly command: IEncodedCommand<
            IChainedCommand<ISessionCommand, IFrontendDelta> &
              Readonly<{ sessionIndex: number; pushIndex: null }>
          >;
        },
      ]
    >,
  ): Promise<
    ILinkedRpcEnvelope<
      Readonly<{ aggregateIndex: number; commandId: string }>,
      IAnyErrorJson
    >
  > {
    // 1 — run pushCommand with the instance-bound dependencies
    return this.#runtime.runPromise(
      pushCommand({ request, authResults: this.#authResults }),
    );
  }

  /*
   * AggregateFrontendApi serves reconnect history from UserVersionedAggregateChain.
   * The capability binds the frontend identity; the request supplies the replay
   * cursor and aggregateVersion.
   *
   * 1. Run the bound domain operation.
   */
  async getFinalizedCommands(
    request: IRpcRequest<
      [{ afterUserIndex: number; aggregateVersion: string }]
    >,
  ): Promise<
    ILinkedRpcEnvelope<
      Readonly<{
        commands: readonly IAggregateFrontendFinalizedCommand[];
        tip: number;
      }>,
      IAnyErrorJson
    >
  > {
    // 1 — run getFinalizedCommands with the instance-bound dependencies
    return this.#runtime.runPromise(
      getFinalizedCommands({ request, authResults: this.#authResults }),
    );
  }

  /*
   * The aggregate frontend capability requests a named service query with its
   * admitted frontend lock. The worker query path requires complete frontend context
   * and runs the named query in the requested service.
   *
   * 1. Run the bound domain operation.
   */
  async executeServiceQuery(
    request: IRpcRequest<
      [{ serviceName: string; queryName: string; params: unknown }]
    >,
  ): Promise<ILinkedRpcEnvelope<unknown, IAnyErrorJson>> {
    // 1 — run executeServiceQuery with the instance-bound dependencies
    return this.#runtime.runPromise(
      executeServiceQuery({ request, authResults: this.#authResults }),
    );
  }

  /*
   * The aggregate frontend capability selects the current base version and
   * requests its user/frontend snapshot from ReplicaRepo. The Replica
   * Repo owns catch-up and projected state.
   *
   * 1. Run the bound domain operation.
   */
  async getState(
    request: IRpcRequest<[{ outstandingCommandIds: readonly string[] }]>,
  ): Promise<ILinkedRpcEnvelope<IAggregateFrontendSyncState, IAnyErrorJson>> {
    // 1 — run getState with the instance-bound dependencies
    return this.#runtime.runPromise(
      getState({ request, authResults: this.#authResults }),
    );
  }

  /*
   * The aggregate frontend capability requests a ticket for a caller-selected
   * aggregateVersion, using its bound aggregate, user, frontend, and system fields.
   * SystemRepo owns ticket persistence and later consumption.
   *
   * 1. Run the bound domain operation.
   */
  async createWebSocketTicket(
    request: IRpcRequest<[{ aggregateVersion: string }]>,
  ): Promise<
    ILinkedRpcEnvelope<
      Readonly<{
        ticket: string;
      }>,
      IAnyErrorJson
    >
  > {
    // 1 — run createWebSocketTicket with the instance-bound dependencies
    return this.#runtime.runPromise(
      createWebSocketTicket({
        request,
        authResults: this.#authResults,
      }),
    );
  }
}
