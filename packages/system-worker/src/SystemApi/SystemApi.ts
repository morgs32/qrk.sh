import type {
  IAggregateCommand,
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import type {
  IEncodedQuery,
  ISystem,
  ISystemId,
} from '@zerospin/core/system/types';
import type { IRpcRequest } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';

import { checkSystemSpec } from './checkSystemSpec/checkSystemSpec.js';
import { executeAggregateCommand } from './executeAggregateCommand/executeAggregateCommand.js';
import { executeSelectQuery } from './executeSelectQuery/executeSelectQuery.js';
import { executeServiceCommand } from './executeServiceCommand/executeServiceCommand.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getAggregateActorVersionChains } from './getAggregateActorVersionChains/getAggregateActorVersionChains.js';
import { getAggregateActorVersionChainTableRows } from './getAggregateActorVersionChainTableRows/getAggregateActorVersionChainTableRows.js';
import { getAggregateActorVersionRepos } from './getAggregateActorVersionRepos/getAggregateActorVersionRepos.js';
import { getAggregateActorVersionRepoTableRows } from './getAggregateActorVersionRepoTableRows/getAggregateActorVersionRepoTableRows.js';
import { getAggregateChains } from './getAggregateChains/getAggregateChains.js';
import { getAggregateChainTableRows } from './getAggregateChainTableRows/getAggregateChainTableRows.js';
import { getAggregateVersionChains } from './getAggregateVersionChains/getAggregateVersionChains.js';
import { getAggregateVersionChainTableRows } from './getAggregateVersionChainTableRows/getAggregateVersionChainTableRows.js';
import { getAggregateVersionRepos } from './getAggregateVersionRepos/getAggregateVersionRepos.js';
import { getAggregateVersionRepoTableRows } from './getAggregateVersionRepoTableRows/getAggregateVersionRepoTableRows.js';
import { getServiceActorVersionChains } from './getServiceActorVersionChains/getServiceActorVersionChains.js';
import { getServiceActorVersionChainTableRows } from './getServiceActorVersionChainTableRows/getServiceActorVersionChainTableRows.js';
import { getServiceActorVersionRepos } from './getServiceActorVersionRepos/getServiceActorVersionRepos.js';
import { getServiceActorVersionRepoTableRows } from './getServiceActorVersionRepoTableRows/getServiceActorVersionRepoTableRows.js';
import { getServiceChains } from './getServiceChains/getServiceChains.js';
import { getServiceChainTableRows } from './getServiceChainTableRows/getServiceChainTableRows.js';
import { getServiceVersionChains } from './getServiceVersionChains/getServiceVersionChains.js';
import { getServiceVersionChainTableRows } from './getServiceVersionChainTableRows/getServiceVersionChainTableRows.js';
import { getServiceVersionRepos } from './getServiceVersionRepos/getServiceVersionRepos.js';
import { getServiceVersionRepoTableRows } from './getServiceVersionRepoTableRows/getServiceVersionRepoTableRows.js';
import { getSystemLogRepos } from './getSystemLogRepos/getSystemLogRepos.js';
import { getSystemLogRepoTableRows } from './getSystemLogRepoTableRows/getSystemLogRepoTableRows.js';
import { getSystemRepos } from './getSystemRepos/getSystemRepos.js';
import { getSystemRepoTableRows } from './getSystemRepoTableRows/getSystemRepoTableRows.js';
import { healthcheck } from './healthcheck/healthcheck.js';
import { initialize } from './initialize/initialize.js';
import { makeSystemSpec } from './makeSystemSpec/makeSystemSpec.js';

/** Static system RPC boundary backed by the System Worker Effects and Repos. */
export class SystemApi extends RpcTarget {
  readonly #authResults: {
    readonly systemId: ISystemId;
  };
  readonly #runtime: ISystem['runtime'];

  /*
   * Constructs SystemApi with its bound runtime and instance state.
   *
   * 1. Initialize and bind the instance.
   */
  constructor(props: { systemId: ISystemId; runtime: ISystem['runtime'] }) {
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
  async healthcheck(request: IRpcRequest<[]>) {
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
  async initialize(request: IRpcRequest<[]>) {
    // 1 — run initialize with the instance-bound dependencies
    return this.#runtime.runPromise(
      initialize({ request, authResults: this.#authResults }),
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
  ) {
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
  ) {
    // 1 — run executeAggregateCommand with the instance-bound dependencies
    return this.#runtime.runPromise(
      executeAggregateCommand({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /** Select-only SQL against aggregate SQLite: System Worker Effect → `AggregateVersionRepo`. */
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
  ) {
    // 1 — run executeSelectQuery with the instance-bound dependencies
    return this.#runtime.runPromise(
      executeSelectQuery({ request, authResults: this.#authResults }),
    );
  }

  /*
   * Secret-key callers submit a complete encoded service command through
   * SystemApi. This boundary routes to ServiceChain and returns its
   * admission receipt through the linked RPC handler.
   *
   * 1. Run the bound domain operation.
   */
  async executeServiceCommand(
    request: IRpcRequest<
      [{ serviceVersion: string; command: IEncodedCommand<IServiceCommand> }]
    >,
  ) {
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
  async getSystemRepos(request: IRpcRequest<[]>) {
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
  ) {
    // 1 — run getSystemRepoTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getSystemRepoTableRows({ request, authResults: this.#authResults }),
    );
  }

  /*
   * SystemApi lists AggregateVersionRepo instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateVersionRepos(request: IRpcRequest<[]>) {
    // 1 — run getAggregateVersionRepos with the instance-bound dependencies
    return this.#runtime.runPromise(
      getAggregateVersionRepos({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi exposes registered AggregateVersionRepo tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateVersionRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ) {
    // 1 — run getAggregateVersionRepoTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getAggregateVersionRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists AggregateActorVersionRepo instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateActorVersionRepos(request: IRpcRequest<[]>) {
    // 1 — run getAggregateActorVersionRepos with the instance-bound dependencies
    return this.#runtime.runPromise(
      getAggregateActorVersionRepos({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi exposes registered AggregateActorVersionRepo tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateActorVersionRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ) {
    // 1 — run getAggregateActorVersionRepoTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getAggregateActorVersionRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists ServiceActorVersionRepo instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceActorVersionRepos(request: IRpcRequest<[]>) {
    // 1 — run getServiceActorVersionRepos with the instance-bound dependencies
    return this.#runtime.runPromise(
      getServiceActorVersionRepos({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi exposes registered ServiceActorVersionRepo tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceActorVersionRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ) {
    // 1 — run getServiceActorVersionRepoTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getServiceActorVersionRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists ServiceVersionRepo instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceVersionRepos(request: IRpcRequest<[]>) {
    // 1 — run getServiceVersionRepos with the instance-bound dependencies
    return this.#runtime.runPromise(
      getServiceVersionRepos({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi exposes registered ServiceVersionRepo tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceVersionRepoTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ) {
    // 1 — run getServiceVersionRepoTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getServiceVersionRepoTableRows({
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
  async getAggregateChains(request: IRpcRequest<[]>) {
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
  ) {
    // 1 — run getAggregateChainTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getAggregateChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists AggregateActorVersionChain instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateActorVersionChains(request: IRpcRequest<[]>) {
    // 1 — run getAggregateActorVersionChains with the instance-bound dependencies
    return this.#runtime.runPromise(
      getAggregateActorVersionChains({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi exposes registered AggregateActorVersionChain tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateActorVersionChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ) {
    // 1 — run getAggregateActorVersionChainTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getAggregateActorVersionChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists AggregateVersionChain instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateVersionChains(request: IRpcRequest<[]>) {
    // 1 — run getAggregateVersionChains with the instance-bound dependencies
    return this.#runtime.runPromise(
      getAggregateVersionChains({
        request,
        authResults: this.#authResults,
      }),
    );
  }
  async getServiceVersionChains(request: IRpcRequest<[]>) {
    // 1 — run getServiceVersionChains with the instance-bound dependencies
    return this.#runtime.runPromise(
      getServiceVersionChains({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi exposes registered AggregateVersionChain tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateVersionChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ) {
    // 1 — run getAggregateVersionChainTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getAggregateVersionChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }
  async getServiceVersionChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ) {
    // 1 — run getServiceVersionChainTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getServiceVersionChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists ServiceActorVersionChain instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceActorVersionChains(request: IRpcRequest<[]>) {
    // 1 — run getServiceActorVersionChains with the instance-bound dependencies
    return this.#runtime.runPromise(
      getServiceActorVersionChains({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi exposes registered ServiceActorVersionChain tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceActorVersionChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ) {
    // 1 — run getServiceActorVersionChainTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getServiceActorVersionChainTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /*
   * SystemApi lists ServiceChain instances recorded in its deployment
   * catalog. Inspection reads registrations from SystemRepo instead of
   * enumerating the Durable Object namespace.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceChains(request: IRpcRequest<[]>) {
    // 1 — run getServiceChains with the instance-bound dependencies
    return this.#runtime.runPromise(
      getServiceChains({ request, authResults: this.#authResults }),
    );
  }

  /*
   * SystemApi exposes registered ServiceChain tables to secret-key
   * inspection callers. The catalog check precedes the Repo lookup; systemId
   * comes from the granted capability, while repoName and tableName come from the request.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceChainTableRows(
    request: IRpcRequest<[{ repoName: string; tableName: string }]>,
  ) {
    // 1 — run getServiceChainTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getServiceChainTableRows({
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
  async getSystemLogRepos(request: IRpcRequest<[]>) {
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
  ) {
    // 1 — run getSystemLogRepoTableRows with the instance-bound dependencies
    return this.#runtime.runPromise(
      getSystemLogRepoTableRows({
        request,
        authResults: this.#authResults,
      }),
    );
  }

  /** Accept this executing Worker's authored aggregate and service definitions. */
  async checkSystemSpec(request: IRpcRequest<[]>) {
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
  async makeSystemSpec(request: IRpcRequest<[]>) {
    // 1 — run makeSystemSpec with the instance-bound dependencies
    return this.#runtime.runPromise(
      makeSystemSpec({ request, authResults: this.#authResults }),
    );
  }
}
