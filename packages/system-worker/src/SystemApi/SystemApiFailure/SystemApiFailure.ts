import { type IAnyError, type IZerospinErrorJson } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { SystemApi } from '../SystemApi.js';

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

export class SystemApiFailure extends RpcTarget {
  /*
   * SystemApiFailure.constructor answers a rejected capability with its retained admission error.
   *
   * 1. Initialize and bind the instance.
   */
  constructor(private readonly error: IAnyError | IZerospinErrorJson) {
    // 1 — construct the base and retain the supplied capability state
    super();
  }

  /*
   * SystemApiFailure.healthcheck answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async healthcheck(
    request: Parameters<SystemApi['healthcheck']>[0],
  ): ReturnType<SystemApi['healthcheck']> {
    // 1 — run healthcheck with the retained admission error
    return Effect.runPromise(healthcheck({ request, error: this.error }));
  }

  /*
   * SystemApiFailure.initialize answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async initialize(
    request: Parameters<SystemApi['initialize']>[0],
  ): ReturnType<SystemApi['initialize']> {
    // 1 — run initialize with the retained admission error
    return Effect.runPromise(initialize({ request, error: this.error }));
  }

  /*
   * SystemApiFailure.executeServiceQuery answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async executeServiceQuery(
    request: Parameters<SystemApi['executeServiceQuery']>[0],
  ): ReturnType<SystemApi['executeServiceQuery']> {
    // 1 — run executeServiceQuery with the retained admission error
    return Effect.runPromise(
      executeServiceQuery({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.executeAggregateCommand answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async executeAggregateCommand(
    request: Parameters<SystemApi['executeAggregateCommand']>[0],
  ): ReturnType<SystemApi['executeAggregateCommand']> {
    // 1 — run executeAggregateCommand with the retained admission error
    return Effect.runPromise(
      executeAggregateCommand({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.executeSelectQuery answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async executeSelectQuery(
    request: Parameters<SystemApi['executeSelectQuery']>[0],
  ): ReturnType<SystemApi['executeSelectQuery']> {
    // 1 — run executeSelectQuery with the retained admission error
    return Effect.runPromise(
      executeSelectQuery({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.executeServiceCommand answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async executeServiceCommand(
    request: Parameters<SystemApi['executeServiceCommand']>[0],
  ): ReturnType<SystemApi['executeServiceCommand']> {
    // 1 — run executeServiceCommand with the retained admission error
    return Effect.runPromise(
      executeServiceCommand({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.getSystemRepos answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getSystemRepos(
    request: Parameters<SystemApi['getSystemRepos']>[0],
  ): ReturnType<SystemApi['getSystemRepos']> {
    // 1 — run getSystemRepos with the retained admission error
    return Effect.runPromise(getSystemRepos({ request, error: this.error }));
  }

  /*
   * SystemApiFailure.getSystemRepoTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getSystemRepoTableRows(
    request: Parameters<SystemApi['getSystemRepoTableRows']>[0],
  ): ReturnType<SystemApi['getSystemRepoTableRows']> {
    // 1 — run getSystemRepoTableRows with the retained admission error
    return Effect.runPromise(
      getSystemRepoTableRows({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.getAggregateVersionRepos answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateVersionRepos(
    request: Parameters<SystemApi['getAggregateVersionRepos']>[0],
  ): ReturnType<SystemApi['getAggregateVersionRepos']> {
    // 1 — run getAggregateVersionRepos with the retained admission error
    return Effect.runPromise(
      getAggregateVersionRepos({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.getAggregateVersionRepoTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateVersionRepoTableRows(
    request: Parameters<SystemApi['getAggregateVersionRepoTableRows']>[0],
  ): ReturnType<SystemApi['getAggregateVersionRepoTableRows']> {
    // 1 — run getAggregateVersionRepoTableRows with the retained admission error
    return Effect.runPromise(
      getAggregateVersionRepoTableRows({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getAggregateActorVersionRepos answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateActorVersionRepos(
    request: Parameters<SystemApi['getAggregateActorVersionRepos']>[0],
  ): ReturnType<SystemApi['getAggregateActorVersionRepos']> {
    // 1 — run getAggregateActorVersionRepos with the retained admission error
    return Effect.runPromise(
      getAggregateActorVersionRepos({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getAggregateActorVersionRepoTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateActorVersionRepoTableRows(
    request: Parameters<SystemApi['getAggregateActorVersionRepoTableRows']>[0],
  ): ReturnType<SystemApi['getAggregateActorVersionRepoTableRows']> {
    // 1 — run getAggregateActorVersionRepoTableRows with the retained admission error
    return Effect.runPromise(
      getAggregateActorVersionRepoTableRows({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getServiceActorVersionRepos answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceActorVersionRepos(
    request: Parameters<SystemApi['getServiceActorVersionRepos']>[0],
  ): ReturnType<SystemApi['getServiceActorVersionRepos']> {
    // 1 — run getServiceActorVersionRepos with the retained admission error
    return Effect.runPromise(
      getServiceActorVersionRepos({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getServiceActorVersionRepoTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceActorVersionRepoTableRows(
    request: Parameters<SystemApi['getServiceActorVersionRepoTableRows']>[0],
  ): ReturnType<SystemApi['getServiceActorVersionRepoTableRows']> {
    // 1 — run getServiceActorVersionRepoTableRows with the retained admission error
    return Effect.runPromise(
      getServiceActorVersionRepoTableRows({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getServiceVersionRepos answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceVersionRepos(
    request: Parameters<SystemApi['getServiceVersionRepos']>[0],
  ): ReturnType<SystemApi['getServiceVersionRepos']> {
    // 1 — run getServiceVersionRepos with the retained admission error
    return Effect.runPromise(
      getServiceVersionRepos({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.getServiceVersionRepoTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceVersionRepoTableRows(
    request: Parameters<SystemApi['getServiceVersionRepoTableRows']>[0],
  ): ReturnType<SystemApi['getServiceVersionRepoTableRows']> {
    // 1 — run getServiceVersionRepoTableRows with the retained admission error
    return Effect.runPromise(
      getServiceVersionRepoTableRows({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getAggregateChains answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateChains(
    request: Parameters<SystemApi['getAggregateChains']>[0],
  ): ReturnType<SystemApi['getAggregateChains']> {
    // 1 — run getAggregateChains with the retained admission error
    return Effect.runPromise(
      getAggregateChains({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.getAggregateChainTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateChainTableRows(
    request: Parameters<SystemApi['getAggregateChainTableRows']>[0],
  ): ReturnType<SystemApi['getAggregateChainTableRows']> {
    // 1 — run getAggregateChainTableRows with the retained admission error
    return Effect.runPromise(
      getAggregateChainTableRows({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.getAggregateActorVersionChains answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateActorVersionChains(
    request: Parameters<SystemApi['getAggregateActorVersionChains']>[0],
  ): ReturnType<SystemApi['getAggregateActorVersionChains']> {
    // 1 — run getAggregateActorVersionChains with the retained admission error
    return Effect.runPromise(
      getAggregateActorVersionChains({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.getAggregateActorVersionChainTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateActorVersionChainTableRows(
    request: Parameters<SystemApi['getAggregateActorVersionChainTableRows']>[0],
  ): ReturnType<SystemApi['getAggregateActorVersionChainTableRows']> {
    // 1 — run getAggregateActorVersionChainTableRows with the retained admission error
    return Effect.runPromise(
      getAggregateActorVersionChainTableRows({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getAggregateVersionChains answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateVersionChains(
    request: Parameters<SystemApi['getAggregateVersionChains']>[0],
  ): ReturnType<SystemApi['getAggregateVersionChains']> {
    // 1 — run getAggregateVersionChains with the retained admission error
    return Effect.runPromise(
      getAggregateVersionChains({ request, error: this.error }),
    );
  }
  async getServiceVersionChains(
    request: Parameters<SystemApi['getServiceVersionChains']>[0],
  ): ReturnType<SystemApi['getServiceVersionChains']> {
    // 1 — run getServiceVersionChains with the retained admission error
    return Effect.runPromise(
      getServiceVersionChains({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.getAggregateVersionChainTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateVersionChainTableRows(
    request: Parameters<SystemApi['getAggregateVersionChainTableRows']>[0],
  ): ReturnType<SystemApi['getAggregateVersionChainTableRows']> {
    // 1 — run getAggregateVersionChainTableRows with the retained admission error
    return Effect.runPromise(
      getAggregateVersionChainTableRows({
        request,
        error: this.error,
      }),
    );
  }
  async getServiceVersionChainTableRows(
    request: Parameters<SystemApi['getServiceVersionChainTableRows']>[0],
  ): ReturnType<SystemApi['getServiceVersionChainTableRows']> {
    // 1 — run getServiceVersionChainTableRows with the retained admission error
    return Effect.runPromise(
      getServiceVersionChainTableRows({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getServiceActorVersionChains answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceActorVersionChains(
    request: Parameters<SystemApi['getServiceActorVersionChains']>[0],
  ): ReturnType<SystemApi['getServiceActorVersionChains']> {
    // 1 — run getServiceActorVersionChains with the retained admission error
    return Effect.runPromise(
      getServiceActorVersionChains({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getServiceActorVersionChainTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceActorVersionChainTableRows(
    request: Parameters<SystemApi['getServiceActorVersionChainTableRows']>[0],
  ): ReturnType<SystemApi['getServiceActorVersionChainTableRows']> {
    // 1 — run getServiceActorVersionChainTableRows with the retained admission error
    return Effect.runPromise(
      getServiceActorVersionChainTableRows({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getServiceChains answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceChains(
    request: Parameters<SystemApi['getServiceChains']>[0],
  ): ReturnType<SystemApi['getServiceChains']> {
    // 1 — run getServiceChains with the retained admission error
    return Effect.runPromise(getServiceChains({ request, error: this.error }));
  }

  /*
   * SystemApiFailure.getServiceChainTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceChainTableRows(
    request: Parameters<SystemApi['getServiceChainTableRows']>[0],
  ): ReturnType<SystemApi['getServiceChainTableRows']> {
    // 1 — run getServiceChainTableRows with the retained admission error
    return Effect.runPromise(
      getServiceChainTableRows({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.getSystemLogRepos answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getSystemLogRepos(
    request: Parameters<SystemApi['getSystemLogRepos']>[0],
  ): ReturnType<SystemApi['getSystemLogRepos']> {
    // 1 — run getSystemLogRepos with the retained admission error
    return Effect.runPromise(getSystemLogRepos({ request, error: this.error }));
  }

  /*
   * SystemApiFailure.getSystemLogRepoTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getSystemLogRepoTableRows(
    request: Parameters<SystemApi['getSystemLogRepoTableRows']>[0],
  ): ReturnType<SystemApi['getSystemLogRepoTableRows']> {
    // 1 — run getSystemLogRepoTableRows with the retained admission error
    return Effect.runPromise(
      getSystemLogRepoTableRows({ request, error: this.error }),
    );
  }

  /** Reject spec acceptance with the capability's retained admission error. */
  async checkSystemSpec(
    request: Parameters<SystemApi['checkSystemSpec']>[0],
  ): ReturnType<SystemApi['checkSystemSpec']> {
    return Effect.runPromise(checkSystemSpec({ request, error: this.error }));
  }

  /*
   * SystemApiFailure.makeSystemSpec answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async makeSystemSpec(
    request: Parameters<SystemApi['makeSystemSpec']>[0],
  ): ReturnType<SystemApi['makeSystemSpec']> {
    // 1 — run makeSystemSpec with the retained admission error
    return Effect.runPromise(makeSystemSpec({ request, error: this.error }));
  }
}
