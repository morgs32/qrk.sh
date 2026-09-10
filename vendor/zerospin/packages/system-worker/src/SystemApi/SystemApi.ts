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

import { checkSystemSpec } from './checkSystemSpec/checkSystemSpec.js';
import { executeAggregateCommand } from './executeAggregateCommand/executeAggregateCommand.js';
import { executeSelectQuery } from './executeSelectQuery/executeSelectQuery.js';
import { executeServiceCommand } from './executeServiceCommand/executeServiceCommand.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getAggregateChains } from './getAggregateChains/getAggregateChains.js';
import { getAggregateChainTableRows } from './getAggregateChainTableRows/getAggregateChainTableRows.js';
import { getAggregateFrontendState } from './getAggregateFrontendState/getAggregateFrontendState.js';
import { getFrontendServiceChains } from './getFrontendServiceChains/getFrontendServiceChains.js';
import { getFrontendServiceChainTableRows } from './getFrontendServiceChainTableRows/getFrontendServiceChainTableRows.js';
import { getFrontendVersionedServiceRepos } from './getFrontendVersionedServiceRepos/getFrontendVersionedServiceRepos.js';
import { getFrontendVersionedServiceRepoTableRows } from './getFrontendVersionedServiceRepoTableRows/getFrontendVersionedServiceRepoTableRows.js';
import { getServiceAdmittedChains } from './getServiceAdmittedChains/getServiceAdmittedChains.js';
import { getServiceAdmittedChainTableRows } from './getServiceAdmittedChainTableRows/getServiceAdmittedChainTableRows.js';
import { getSystemLogRepos } from './getSystemLogRepos/getSystemLogRepos.js';
import { getSystemLogRepoTableRows } from './getSystemLogRepoTableRows/getSystemLogRepoTableRows.js';
import { getSystemRepos } from './getSystemRepos/getSystemRepos.js';
import { getSystemRepoTableRows } from './getSystemRepoTableRows/getSystemRepoTableRows.js';
import { getUserVersionedAggregateChains } from './getUserVersionedAggregateChains/getUserVersionedAggregateChains.js';
import { getUserVersionedAggregateChainTableRows } from './getUserVersionedAggregateChainTableRows/getUserVersionedAggregateChainTableRows.js';
import { getUserVersionedAggregateRepos } from './getUserVersionedAggregateRepos/getUserVersionedAggregateRepos.js';
import { getUserVersionedAggregateRepoTableRows } from './getUserVersionedAggregateRepoTableRows/getUserVersionedAggregateRepoTableRows.js';
import { getVersionedAggregateChains } from './getVersionedAggregateChains/getVersionedAggregateChains.js';
import { getVersionedAggregateChainTableRows } from './getVersionedAggregateChainTableRows/getVersionedAggregateChainTableRows.js';
import { getVersionedAggregateRepos } from './getVersionedAggregateRepos/getVersionedAggregateRepos.js';
import { getVersionedAggregateRepoTableRows } from './getVersionedAggregateRepoTableRows/getVersionedAggregateRepoTableRows.js';
import { getVersionedServiceChains } from './getVersionedServiceChains/getVersionedServiceChains.js';
import { getVersionedServiceChainTableRows } from './getVersionedServiceChainTableRows/getVersionedServiceChainTableRows.js';
import { getVersionedServiceRepos } from './getVersionedServiceRepos/getVersionedServiceRepos.js';
import { getVersionedServiceRepoTableRows } from './getVersionedServiceRepoTableRows/getVersionedServiceRepoTableRows.js';
import { healthcheck } from './healthcheck/healthcheck.js';
import { initialize } from './initialize/initialize.js';
import { makeSystemSpec } from './makeSystemSpec/makeSystemSpec.js';

/** Static system RPC boundary backed by the System Worker Effects and Repos. */
export class SystemApi extends RpcTarget {
  readonly #authResults: {
    readonly systemId: ISystemId;
  };
  readonly #runtime: ISystemRuntime;

  /*
   * Constructs SystemApi with its bound runtime and instance state.
   *
   * 1. Initialize and bind the instance.
   */
  constructor(props: { systemId: ISystemId; runtime: ISystemRuntime }) {
    // 1 — construct the base and retain the supplied capability state
    super();
    const { runtime, systemId } = props;
    this.#authResults = {
      systemId,
    };
    this.#runtime = runtime;
  }

  /*
   * Reports that the granted SystemApi handler is callable.
   *
   * 1. Run the bound domain operation.
   */
  async healthcheck(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<string, IAnyErrorJson>> {
    // 1 — run healthcheck with the instance-bound dependencies
    return this.#runtime.runPromise(
      healthcheck({ request, authResults: this.#authResults }),
    );
  }

  /** Wake every known command chain after deploy so constructors pick up the current spec. */
  /*
   * SystemApi asks the configured SystemRepo to initialize its catalog chains.
   *
   * 1. Run the bound domain operation.
   */
  async initialize(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<void, IAnyErrorJson>> {
    // 1 — run initialize with the instance-bound dependencies
    return this.#runtime.runPromise(
      initialize({ request, authResults: this.#authResults }),
    );
  }

  /**
   * Admin/tooling optimistic frontend state load: SystemApi handler → `UserVersionedAggregateRepo`.
   */
  /*
   * Secret-key callers request an aggregate frontend snapshot through SystemApi.
   * The API handler selects the base version, reads its Replica Repo, and adapts
   * resources to the requested lock; userId and frontend fields are caller arguments.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateFrontendState(
    request: IRpcRequest<
      [
        {
          aggregateId: IAggregateId;
          aggregateName: string;
          aggregateVersion: string;
          userId: string;
          frontendName: string;
          aggregateFrontendLock: Schema.Schema.Type<
            typeof AggregateFrontendLockSchema
          >;
        },
      ]
    >,
  ): Promise<ILinkedRpcEnvelope<IAggregateFrontendSyncState, IAnyErrorJson>> {
    // 1 — run getAggregateFrontendState with the instance-bound dependencies
    return this.#runtime.runPromise(
      getAggregateFrontendState({ request, authResults: this.#authResults }),
    );
  }

  /*
   * SystemApi exposes named authored service queries to secret-key callers.
   * The worker query path resolves and executes the query in its owning service.
   *
   * 1. Run the bound domain operation.
   */
  async executeServiceQuery(
    request: IRpcRequest<
      [
        {
          serviceName: string;
          serviceVersion: string;
          queryName: string;
          params: unknown;
        },
      ]
    >,
  ): Promise<ILinkedRpcEnvelope<unknown, IAnyErrorJson>> {
    // 1 — run executeServiceQuery with the instance-bound dependencies
    return this.#runtime.runPromise(
      executeServiceQuery({ request, authResults: this.#authResults }),
    );
  }

  /** One aggregate command enters its ordered command chain. */
  /*
   * Secret-key callers submit a complete encoded aggregate command through
   * SystemApi. This boundary routes to AggregateChain and returns its
   * admission receipt through the linked RPC handler.
   *
   * 1. Run the bound domain operation.
   */
  async executeAggregateCommand(
    request: IRpcRequest<
      [
        {
          aggregateVersion: string;
          command: IEncodedCommand<IAggregateCommand>;
        },
      ]
    >,
  ): Promise<
    ILinkedRpcEnvelope<
      Schema.Schema.Type<typeof AggregateChainedCommandSchema>,
      IAnyErrorJson
    >
  > {
    // 1 — run executeAggregateCommand with the instance-bound dependencies
    return this.#runtime.runPromise(
      executeAggregateCommand({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /** Select-only SQL against aggregate SQLite: System Worker Effect → `VersionedAggregateRepo`. */
  /*
   * SystemApi routes secret-key SQL reads to the aggregate current base VAR.
   * This API validates the request and RPC result; VAR owns SQL execution.
   *
   * 1. Run the bound domain operation.
   */
  async executeSelectQuery(
    request: IRpcRequest<
      [
        {
          aggregateId: IAggregateId;
          aggregateName: string;
          aggregateVersion: string;
          query: IEncodedQuery;
        },
      ]
    >,
  ): Promise<ILinkedRpcEnvelope<unknown, IAnyErrorJson>> {
    // 1 — run executeSelectQuery with the instance-bound dependencies
    return this.#runtime.runPromise(
      executeSelectQuery({ request, authResults: this.#authResults }),
    );
  }

  /*
   * Secret-key callers submit a complete encoded service command through
   * SystemApi. This boundary routes to ServiceAdmittedChain and returns its
   * admission receipt through the linked RPC handler.
   *
   * 1. Run the bound domain operation.
   */
  async executeServiceCommand(
    request: IRpcRequest<
      [{ serviceVersion: string; command: IEncodedCommand<IServiceCommand> }]
    >,
  ): Promise<
    ILinkedRpcEnvelope<
      Schema.Schema.Type<typeof ServiceChainedCommandSchema>,
      IAnyErrorJson
    >
  > {
    // 1 — run executeServiceCommand with the instance-bound dependencies
    return this.#runtime.runPromise(
      executeServiceCommand({ request, authResults: this.#authResults }),
    );
  }

  /*
   * SystemApi lists SystemRepo instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getSystemRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    // 1 — run getSystemRepos with the instance-bound dependencies
    return this.#runtime.runPromise(
      getSystemRepos({ request, authResults: this.#authResults }),
    );
  }

  /*
   * SystemApi exposes registered SystemRepo tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getSystemRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    // 1 — run getSystemRepoTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getSystemRepoTableRows({ request, authResults: this.#authResults }),
    );
  }

  /*
   * SystemApi lists VersionedAggregateRepo instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getVersionedAggregateRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    // 1 — run getVersionedAggregateRepos with the instance-bound dependencies
    return this.#runtime.runPromise(
      getVersionedAggregateRepos({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi exposes registered VersionedAggregateRepo tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getVersionedAggregateRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    // 1 — run getVersionedAggregateRepoTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getVersionedAggregateRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists UserVersionedAggregateRepo instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getUserVersionedAggregateRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    // 1 — run getUserVersionedAggregateRepos with the instance-bound dependencies
    return this.#runtime.runPromise(
      getUserVersionedAggregateRepos({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi exposes registered UserVersionedAggregateRepo tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getUserVersionedAggregateRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    // 1 — run getUserVersionedAggregateRepoTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getUserVersionedAggregateRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists FrontendVersionedServiceRepo instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getFrontendVersionedServiceRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    // 1 — run getFrontendVersionedServiceRepos with the instance-bound dependencies
    return this.#runtime.runPromise(
      getFrontendVersionedServiceRepos({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi exposes registered FrontendVersionedServiceRepo tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getFrontendVersionedServiceRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    // 1 — run getFrontendVersionedServiceRepoTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getFrontendVersionedServiceRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists VersionedServiceRepo instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getVersionedServiceRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    // 1 — run getVersionedServiceRepos with the instance-bound dependencies
    return this.#runtime.runPromise(
      getVersionedServiceRepos({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi exposes registered VersionedServiceRepo tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getVersionedServiceRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    // 1 — run getVersionedServiceRepoTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getVersionedServiceRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists AggregateChain instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateChains(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    // 1 — run getAggregateChains with the instance-bound dependencies
    return this.#runtime.runPromise(
      getAggregateChains({ request, authResults: this.#authResults }),
    );
  }

  /*
   * SystemApi exposes registered AggregateChain tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    // 1 — run getAggregateChainTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getAggregateChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists UserVersionedAggregateChain instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getUserVersionedAggregateChains(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    // 1 — run getUserVersionedAggregateChains with the instance-bound dependencies
    return this.#runtime.runPromise(
      getUserVersionedAggregateChains({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi exposes registered UserVersionedAggregateChain tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getUserVersionedAggregateChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    // 1 — run getUserVersionedAggregateChainTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getUserVersionedAggregateChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists VersionedAggregateChain instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getVersionedAggregateChains(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    // 1 — run getVersionedAggregateChains with the instance-bound dependencies
    return this.#runtime.runPromise(
      getVersionedAggregateChains({
        request,
        authResults: this.#authResults,
      }),
    );
  }
  async getVersionedServiceChains(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    // 1 — run getVersionedServiceChains with the instance-bound dependencies
    return this.#runtime.runPromise(
      getVersionedServiceChains({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi exposes registered VersionedAggregateChain tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getVersionedAggregateChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    // 1 — run getVersionedAggregateChainTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getVersionedAggregateChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }
  async getVersionedServiceChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    // 1 — run getVersionedServiceChainTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getVersionedServiceChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists FrontendServiceChain instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getFrontendServiceChains(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    // 1 — run getFrontendServiceChains with the instance-bound dependencies
    return this.#runtime.runPromise(
      getFrontendServiceChains({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi exposes registered FrontendServiceChain tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getFrontendServiceChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    // 1 — run getFrontendServiceChainTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getFrontendServiceChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists ServiceAdmittedChain instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceAdmittedChains(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    // 1 — run getServiceAdmittedChains with the instance-bound dependencies
    return this.#runtime.runPromise(
      getServiceAdmittedChains({ request, authResults: this.#authResults }),
    );
  }

  /*
   * SystemApi exposes registered ServiceAdmittedChain tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceAdmittedChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    // 1 — run getServiceAdmittedChainTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getServiceAdmittedChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists SystemLogRepo instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getSystemLogRepos(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>> {
    // 1 — run getSystemLogRepos with the instance-bound dependencies
    return this.#runtime.runPromise(
      getSystemLogRepos({ request, authResults: this.#authResults }),
    );
  }

  /*
   * SystemApi exposes registered SystemLogRepo tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getSystemLogRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>> {
    // 1 — run getSystemLogRepoTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getSystemLogRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /** Accept this executing Worker's authored aggregate and service definitions. */
  async checkSystemSpec(
    request: IRpcRequest<[]>,
  ): Promise<
    ILinkedRpcEnvelope<{ workerVersionId: string | null }, IAnyErrorJson>
  > {
    return this.#runtime.runPromise(
      checkSystemSpec({ request, authResults: this.#authResults }),
    );
  }

  /** Return deployed system spec snapshot. */
  /*
   * SystemApi returns the authored deployment spec for inspection callers.
   *
   * 1. Run the bound domain operation.
   */
  async makeSystemSpec(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<ISystemSpec, IAnyErrorJson>> {
    // 1 — run makeSystemSpec with the instance-bound dependencies
    return this.#runtime.runPromise(
      makeSystemSpec({ request, authResults: this.#authResults }),
    );
  }
}
