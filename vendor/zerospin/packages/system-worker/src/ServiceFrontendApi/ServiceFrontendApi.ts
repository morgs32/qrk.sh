import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type {
  IServiceFrontendFinalizedCommand,
  IServiceFrontendState,
} from '@zerospin/core/serviceSession/types';
import type { ISystemId } from '@zerospin/core/system/types';
import type { IAnyErrorJson } from '@zerospin/error';
import type { ILinkedRpcEnvelope, IRpcRequest } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import type { Schema } from 'effect';

import type { ISystemRuntime } from '../makeSystemRuntime.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { getFinalizedCommands } from './getFinalizedCommands/getFinalizedCommands.js';
import { getState } from './getState/getState.js';

export class ServiceFrontendApi extends RpcTarget {
  readonly #authResults: {
    readonly userId: string;
    readonly frontendName: string;
    readonly serviceFrontendLock: Schema.Schema.Type<
      typeof ServiceFrontendLockSchema
    >;
    readonly serviceName: string;
    serviceVersion: string;
    readonly systemId: ISystemId;
  };
  readonly #runtime: ISystemRuntime;

  /*
   * Constructs ServiceFrontendApi with its bound runtime and instance state.
   *
   * 1. Initialize and bind the instance.
   */
  constructor(props: {
    authResults: {
      readonly userId: string;
      readonly frontendName: string;
      readonly serviceFrontendLock: Schema.Schema.Type<
        typeof ServiceFrontendLockSchema
      >;
      readonly serviceName: string;
      serviceVersion: string;
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
   * The service frontend capability requests its snapshot from
   * FrontendVersionedServiceRepo and adapts resources to the exact
   * frontend selection. The materializer owns catch-up and frontend state.
   *
   * 1. Run the bound domain operation.
   */
  async getState(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<IServiceFrontendState, IAnyErrorJson>> {
    // 1 — run getState with the instance-bound dependencies
    return this.#runtime.runPromise(
      getState({ request, authResults: this.#authResults }),
    );
  }

  /*
   * ServiceFrontendApi serves reconnect history from FrontendServiceChain.
   * The capability binds the frontend identity; the request supplies the replay
   * cursor.
   *
   * 1. Run the bound domain operation.
   */
  async getFinalizedCommands(
    request: IRpcRequest<
      [{ afterServiceIndex: number; serviceVersion: string }]
    >,
  ): Promise<
    ILinkedRpcEnvelope<
      Readonly<{
        commands: readonly IEncodedCommand<IServiceFrontendFinalizedCommand>[];
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
   * The service frontend capability requests a WebSocket ticket using its
   * bound service, user, frontend, and system fields. SystemRepo owns ticket
   * persistence and later consumption.
   *
   * 1. Run the bound domain operation.
   */
  async createWebSocketTicket(
    request: IRpcRequest<[{ serviceVersion: string }]>,
  ): Promise<
    ILinkedRpcEnvelope<
      {
        ticket: string;
      },
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
