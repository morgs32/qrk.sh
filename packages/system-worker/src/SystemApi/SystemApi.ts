import type {
  AggregateChainedCommandSchema,
  ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
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

import type { ISystemRuntime } from '../makeSystemRuntime.js';

import { executeSelectQuery } from './executeSelectQuery/executeSelectQuery.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { finalizeAggregateCommand } from './finalizeAggregateCommand/finalizeAggregateCommand.js';
import { finalizeServiceCommand } from './finalizeServiceCommand/finalizeServiceCommand.js';
import { getAggregateCommandChains } from './getAggregateCommandChains/getAggregateCommandChains.js';
import { getAggregateCommandChainTableRows } from './getAggregateCommandChainTableRows/getAggregateCommandChainTableRows.js';
import { getAggregateFrontendFinalizedCommandChains } from './getAggregateFrontendFinalizedCommandChains/getAggregateFrontendFinalizedCommandChains.js';
import { getAggregateFrontendFinalizedCommandChainTableRows } from './getAggregateFrontendFinalizedCommandChainTableRows/getAggregateFrontendFinalizedCommandChainTableRows.js';
import { getAggregateFrontendPushedCommandChains } from './getAggregateFrontendPushedCommandChains/getAggregateFrontendPushedCommandChains.js';
import { getAggregateFrontendPushedCommandChainTableRows } from './getAggregateFrontendPushedCommandChainTableRows/getAggregateFrontendPushedCommandChainTableRows.js';
import { getAggregateFrontendState } from './getAggregateFrontendState/getAggregateFrontendState.js';
import { getMaterializedAggregateFrontendRepos } from './getMaterializedAggregateFrontendRepos/getMaterializedAggregateFrontendRepos.js';
import { getMaterializedAggregateFrontendRepoTableRows } from './getMaterializedAggregateFrontendRepoTableRows/getMaterializedAggregateFrontendRepoTableRows.js';
import { getMaterializedAggregateRepos } from './getMaterializedAggregateRepos/getMaterializedAggregateRepos.js';
import { getMaterializedAggregateRepoTableRows } from './getMaterializedAggregateRepoTableRows/getMaterializedAggregateRepoTableRows.js';
import { getMaterializedServiceFrontendRepos } from './getMaterializedServiceFrontendRepos/getMaterializedServiceFrontendRepos.js';
import { getMaterializedServiceFrontendRepoTableRows } from './getMaterializedServiceFrontendRepoTableRows/getMaterializedServiceFrontendRepoTableRows.js';
import { getMaterializedServiceRepos } from './getMaterializedServiceRepos/getMaterializedServiceRepos.js';
import { getMaterializedServiceRepoTableRows } from './getMaterializedServiceRepoTableRows/getMaterializedServiceRepoTableRows.js';
import { getServiceCommandChains } from './getServiceCommandChains/getServiceCommandChains.js';
import { getServiceCommandChainTableRows } from './getServiceCommandChainTableRows/getServiceCommandChainTableRows.js';
import { getServiceFrontendFinalizedCommandChains } from './getServiceFrontendFinalizedCommandChains/getServiceFrontendFinalizedCommandChains.js';
import { getServiceFrontendFinalizedCommandChainTableRows } from './getServiceFrontendFinalizedCommandChainTableRows/getServiceFrontendFinalizedCommandChainTableRows.js';
import { getSystemLogRepos } from './getSystemLogRepos/getSystemLogRepos.js';
import { getSystemLogRepoTableRows } from './getSystemLogRepoTableRows/getSystemLogRepoTableRows.js';
import { getSystemRepos } from './getSystemRepos/getSystemRepos.js';
import { getSystemRepoTableRows } from './getSystemRepoTableRows/getSystemRepoTableRows.js';
import { healthcheck } from './healthcheck/healthcheck.js';
import { makeSystemSpec } from './makeSystemSpec/makeSystemSpec.js';

/** Static system RPC boundary backed by the System Worker Effects and Repos. */
export class SystemApi extends RpcTarget {
  readonly #authResults: {
    readonly systemId: ISystemId;
  };
  readonly #runtime: ISystemRuntime;

  constructor(props: { systemId: ISystemId; runtime: ISystemRuntime }) {
    super();
    this.#authResults = {
      systemId: props.systemId,
    };
    this.#runtime = props.runtime;
  }

  async healthcheck(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<string, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      healthcheck({ request, authResults: this.#authResults }),
    );
  }

  /**
   * Admin/tooling optimistic frontend state load: System Worker Effect → `MaterializedAggregateFrontendRepo`.
   */
  async getAggregateFrontendState(
    request: IRpcRequest<
      [
        {
          aggregateId: IAggregateId;
          aggregateName: string;
          userId: string;
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

  /** One aggregate command enters its ordered command chain. */
  async finalizeAggregateCommand(
    request: IRpcRequest<[IEncodedCommand<IAggregateCommand>]>,
  ): Promise<
    ILinkedRpcEnvelope<
      Schema.Schema.Type<typeof AggregateChainedCommandSchema>,
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      finalizeAggregateCommand({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /** Select-only SQL against aggregate SQLite: System Worker Effect → `MaterializedAggregateRepo`. */
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

  async finalizeServiceCommand(
    request: IRpcRequest<[IEncodedCommand<IServiceCommand>]>,
  ): Promise<
    ILinkedRpcEnvelope<
      Schema.Schema.Type<typeof ServiceChainedCommandSchema>,
      IAnyErrorJson
    >
  > {
    return this.#runtime.runPromise(
      finalizeServiceCommand({ request, authResults: this.#authResults }),
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

  async getMaterializedAggregateRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getMaterializedAggregateRepos({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getMaterializedAggregateRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getMaterializedAggregateRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getMaterializedAggregateFrontendRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getMaterializedAggregateFrontendRepos({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getMaterializedAggregateFrontendRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getMaterializedAggregateFrontendRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getMaterializedServiceFrontendRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getMaterializedServiceFrontendRepos({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getMaterializedServiceFrontendRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getMaterializedServiceFrontendRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getMaterializedServiceRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getMaterializedServiceRepos({ request, authResults: this.#authResults }),
    );
  }

  async getMaterializedServiceRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getMaterializedServiceRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getAggregateCommandChains(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateCommandChains({ request, authResults: this.#authResults }),
    );
  }

  async getAggregateCommandChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateCommandChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getAggregateFrontendFinalizedCommandChains(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateFrontendFinalizedCommandChains({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getAggregateFrontendFinalizedCommandChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateFrontendFinalizedCommandChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getAggregateFrontendPushedCommandChains(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateFrontendPushedCommandChains({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getAggregateFrontendPushedCommandChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getAggregateFrontendPushedCommandChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getServiceFrontendFinalizedCommandChains(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getServiceFrontendFinalizedCommandChains({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getServiceFrontendFinalizedCommandChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getServiceFrontendFinalizedCommandChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  async getServiceCommandChains(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getServiceCommandChains({ request, authResults: this.#authResults }),
    );
  }

  async getServiceCommandChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    return this.#runtime.runPromise(
      getServiceCommandChainTableRows({
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
