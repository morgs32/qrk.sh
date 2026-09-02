import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IEncodedCommand } from '@zerospin/core/contracts/types';
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
    readonly systemId: ISystemId;
  };
  readonly #runtime: ISystemRuntime;

  constructor(props: {
    authResults: {
      readonly userId: string;
      readonly frontendName: string;
      readonly serviceFrontendLock: Schema.Schema.Type<
        typeof ServiceFrontendLockSchema
      >;
      readonly serviceName: string;
      readonly systemId: ISystemId;
    };
    runtime: ISystemRuntime;
  }) {
    super();
    this.#authResults = props.authResults;
    this.#runtime = props.runtime;
  }

  async getState(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<IServiceFrontendState, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getState({ request, authResults: this.#authResults }),
    );
  }

  async getFinalizedCommands(
    request: IRpcRequest<[{ afterServiceFrontendIndex: number }]>,
  ): Promise<
    ILinkedRpcEnvelope<
      Readonly<{
        commands: readonly IEncodedCommand<IServiceFrontendFinalizedCommand>[];
        tip: number;
      }>,
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      getFinalizedCommands({ request, authResults: this.#authResults }),
    );
  }

  async createWebSocketTicket(request: IRpcRequest<[]>): Promise<
    ILinkedRpcEnvelope<
      {
        ticket: string;
      },
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      createWebSocketTicket({
        request,
        authResults: this.#authResults,
      }),
    );
  }
}
