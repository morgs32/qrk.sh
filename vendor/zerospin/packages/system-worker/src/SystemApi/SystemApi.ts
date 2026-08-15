import type { IUserRef } from '@zerospin/core/aggregate/types';
import type {
  IAggregateCommand,
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedAggregateCommand,
  IExecutedServiceCommand,
  IFailedAggregateCommand,
  IFailedServiceCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type {
  IAggregateCursor,
  IAggregateId,
} from '@zerospin/core/models/types';
import type { IAggregateFrontendSyncState } from '@zerospin/core/session/types';
import type {
  IEncodedQuery,
  IRepoRegistration,
  IRepoTableData,
  ISystemId,
  ISystemSpec,
} from '@zerospin/core/system/types';
import type { IAnyErrorJson } from '@zerospin/error';
import type { ILinkedRpcEnvelope, IRpcRequest } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import type { Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import type { ISystemRuntime } from '../makeSystemRuntime.js';

import { executeSelectQuery } from './executeSelectQuery/executeSelectQuery.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { finalizeAggregateCommands } from './finalizeAggregateCommands/finalizeAggregateCommands.js';
import { finalizeServiceCommands } from './finalizeServiceCommands/finalizeServiceCommands.js';
import { getAggregateBlockRepos } from './getAggregateBlockRepos/getAggregateBlockRepos.js';
import { getAggregateBlockRepoTableRows } from './getAggregateBlockRepoTableRows/getAggregateBlockRepoTableRows.js';
import { getAggregateFrontendBlockRepos } from './getAggregateFrontendBlockRepos/getAggregateFrontendBlockRepos.js';
import { getAggregateFrontendBlockRepoTableRows } from './getAggregateFrontendBlockRepoTableRows/getAggregateFrontendBlockRepoTableRows.js';
import { getAggregateFrontendRepos } from './getAggregateFrontendRepos/getAggregateFrontendRepos.js';
import { getAggregateFrontendRepoTableRows } from './getAggregateFrontendRepoTableRows/getAggregateFrontendRepoTableRows.js';
import { getAggregateFrontendState } from './getAggregateFrontendState/getAggregateFrontendState.js';
import { getAggregateRepos } from './getAggregateRepos/getAggregateRepos.js';
import { getAggregateRepoTableRows } from './getAggregateRepoTableRows/getAggregateRepoTableRows.js';
import { getServiceBlockRepos } from './getServiceBlockRepos/getServiceBlockRepos.js';
import { getServiceBlockRepoTableRows } from './getServiceBlockRepoTableRows/getServiceBlockRepoTableRows.js';
import { getServiceFrontendBlockRepos } from './getServiceFrontendBlockRepos/getServiceFrontendBlockRepos.js';
import { getServiceFrontendBlockRepoTableRows } from './getServiceFrontendBlockRepoTableRows/getServiceFrontendBlockRepoTableRows.js';
import { getServiceFrontendRepos } from './getServiceFrontendRepos/getServiceFrontendRepos.js';
import { getServiceFrontendRepoTableRows } from './getServiceFrontendRepoTableRows/getServiceFrontendRepoTableRows.js';
import { getServiceRepos } from './getServiceRepos/getServiceRepos.js';
import { getServiceRepoTableRows } from './getServiceRepoTableRows/getServiceRepoTableRows.js';
import { getSystemLogRepos } from './getSystemLogRepos/getSystemLogRepos.js';
import { getSystemLogRepoTableRows } from './getSystemLogRepoTableRows/getSystemLogRepoTableRows.js';
import { getSystemRepos } from './getSystemRepos/getSystemRepos.js';
import { getSystemRepoTableRows } from './getSystemRepoTableRows/getSystemRepoTableRows.js';
import { hello } from './hello/hello.js';
import { makeSystemSpec } from './makeSystemSpec/makeSystemSpec.js';

/** Read RPC stubs resolve SystemWorker per call; mutations enter SystemRepo. */
export class SystemApi extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  readonly #authResults: {
    readonly generationId: string;
    readonly systemId: ISystemId;
    readonly systemWorkerName: string;
  };
  readonly #runtime: ISystemRuntime;

  constructor(props: {
    generationId: string;
    systemId: ISystemId;
    systemWorkerName: string;
    runtime: ISystemRuntime;
  }) {
    super();
    this.#authResults = {
      generationId: props.generationId,
      systemId: props.systemId,
      systemWorkerName: props.systemWorkerName,
    };
    this.#runtime = props.runtime;
  }

  async hello(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<string, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      hello({ request, authResults: this.#authResults }),
    );
  }

  /**
   * Admin/tooling optimistic frontend state load: `SystemWorker.getAggregateFrontendState` → `AggregateFrontendRepo`.
   */
  async getAggregateFrontendState(
    request: IRpcRequest<
      [
        {
          actorRef: IUserRef;
          frontendName: string;
          aggregateFrontendLock: Schema.Schema.Type<
            typeof AggregateFrontendLockSchema
          >;
        },
      ]
    >,
  ): Promise<ILinkedRpcEnvelope<IAggregateFrontendSyncState, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateFrontendState({ request, authResults: this.#authResults }),
    );
  }

  async executeServiceQuery(
    request: IRpcRequest<
      [
        {
          serviceName: string;
          queryName: string;
          params: unknown;
        },
      ]
    >,
  ): Promise<ILinkedRpcEnvelope<unknown, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      executeServiceQuery({ request, authResults: this.#authResults }),
    );
  }

  /** Aggregate commands enter the aggregate ledger and graph. */
  async finalizeAggregateCommands(
    request: IRpcRequest<
      [
        {
          aggregateId: IAggregateId;
          aggregateName: string;
          commands: readonly IEncodedCommand<IAggregateCommand>[];
        },
      ]
    >,
  ): Promise<
    ILinkedRpcEnvelope<
      Readonly<{
        executedCommands: readonly IEncodedCommand<IExecutedAggregateCommand>[];
        failedCommands: readonly IEncodedCommand<IFailedAggregateCommand>[];
        appliedMutations: readonly IEncodedAppliedMutation[];
        lastAggregateCursor: IAggregateCursor;
        aggregateIndex: number;
      }>,
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      finalizeAggregateCommands({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /** Select-only SQL against aggregate SQLite: `SystemWorker.executeSelectQuery` → `AggregateRepo`. */
  async executeSelectQuery(
    request: IRpcRequest<
      [
        {
          aggregateId: IAggregateId;
          aggregateName: string;
          query: IEncodedQuery;
        },
      ]
    >,
  ): Promise<ILinkedRpcEnvelope<unknown, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      executeSelectQuery({ request, authResults: this.#authResults }),
    );
  }

  async finalizeServiceCommands(
    request: IRpcRequest<
      [
        {
          serviceName: string;
          commands: readonly IEncodedCommand<IServiceCommand>[];
        },
      ]
    >,
  ): Promise<
    ILinkedRpcEnvelope<
      {
        executedCommands: readonly IEncodedCommand<IExecutedServiceCommand>[];
        failedCommands: readonly IEncodedCommand<IFailedServiceCommand>[];
      },
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      finalizeServiceCommands({ request, authResults: this.#authResults }),
    );
  }

  async getSystemRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getSystemRepos({ request, authResults: this.#authResults }),
    );
  }

  async getSystemRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getSystemRepoTableRows({ request, authResults: this.#authResults }),
    );
  }

  async getAggregateRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateRepos({ request, authResults: this.#authResults }),
    );
  }

  async getAggregateRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getAggregateFrontendRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateFrontendRepos({ request, authResults: this.#authResults }),
    );
  }

  async getAggregateFrontendRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateFrontendRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getServiceFrontendRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getServiceFrontendRepos({ request, authResults: this.#authResults }),
    );
  }

  async getServiceFrontendRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getServiceFrontendRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getServiceRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getServiceRepos({ request, authResults: this.#authResults }),
    );
  }

  async getServiceRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getServiceRepoTableRows({ request, authResults: this.#authResults }),
    );
  }

  async getAggregateBlockRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateBlockRepos({ request, authResults: this.#authResults }),
    );
  }

  async getAggregateBlockRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateBlockRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getAggregateFrontendBlockRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateFrontendBlockRepos({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getAggregateFrontendBlockRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateFrontendBlockRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getServiceFrontendBlockRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getServiceFrontendBlockRepos({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getServiceFrontendBlockRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getServiceFrontendBlockRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getServiceBlockRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getServiceBlockRepos({ request, authResults: this.#authResults }),
    );
  }

  async getServiceBlockRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getServiceBlockRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getSystemLogRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getSystemLogRepos({ request, authResults: this.#authResults }),
    );
  }

  async getSystemLogRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getSystemLogRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /** Return deployed system spec snapshot. */
  async makeSystemSpec(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<ISystemSpec, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      makeSystemSpec({ request, authResults: this.#authResults }),
    );
  }
}
