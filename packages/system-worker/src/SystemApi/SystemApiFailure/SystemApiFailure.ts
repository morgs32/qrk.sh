import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { SystemApi } from '../SystemApi.js';

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

export class SystemApiFailure extends RpcTarget {
  /*
   * SystemApiFailure.constructor answers a rejected capability with its retained admission error.
   *
   * 1. Initialize and bind the instance.
   */
  constructor(private readonly error: IAnyError) {
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
   * SystemApiFailure.getAggregateFrontendState answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getAggregateFrontendState(
    request: Parameters<SystemApi['getAggregateFrontendState']>[0],
  ): ReturnType<SystemApi['getAggregateFrontendState']> {
    // 1 — run getAggregateFrontendState with the retained admission error
    return Effect.runPromise(
      getAggregateFrontendState({ request, error: this.error }),
    );
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
   * SystemApiFailure.getVersionedAggregateRepos answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getVersionedAggregateRepos(
    request: Parameters<SystemApi['getVersionedAggregateRepos']>[0],
  ): ReturnType<SystemApi['getVersionedAggregateRepos']> {
    // 1 — run getVersionedAggregateRepos with the retained admission error
    return Effect.runPromise(
      getVersionedAggregateRepos({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.getVersionedAggregateRepoTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getVersionedAggregateRepoTableRows(
    request: Parameters<SystemApi['getVersionedAggregateRepoTableRows']>[0],
  ): ReturnType<SystemApi['getVersionedAggregateRepoTableRows']> {
    // 1 — run getVersionedAggregateRepoTableRows with the retained admission error
    return Effect.runPromise(
      getVersionedAggregateRepoTableRows({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getUserVersionedAggregateRepos answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getUserVersionedAggregateRepos(
    request: Parameters<SystemApi['getUserVersionedAggregateRepos']>[0],
  ): ReturnType<SystemApi['getUserVersionedAggregateRepos']> {
    // 1 — run getUserVersionedAggregateRepos with the retained admission error
    return Effect.runPromise(
      getUserVersionedAggregateRepos({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getUserVersionedAggregateRepoTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getUserVersionedAggregateRepoTableRows(
    request: Parameters<SystemApi['getUserVersionedAggregateRepoTableRows']>[0],
  ): ReturnType<SystemApi['getUserVersionedAggregateRepoTableRows']> {
    // 1 — run getUserVersionedAggregateRepoTableRows with the retained admission error
    return Effect.runPromise(
      getUserVersionedAggregateRepoTableRows({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getFrontendVersionedServiceRepos answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getFrontendVersionedServiceRepos(
    request: Parameters<SystemApi['getFrontendVersionedServiceRepos']>[0],
  ): ReturnType<SystemApi['getFrontendVersionedServiceRepos']> {
    // 1 — run getFrontendVersionedServiceRepos with the retained admission error
    return Effect.runPromise(
      getFrontendVersionedServiceRepos({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getFrontendVersionedServiceRepoTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getFrontendVersionedServiceRepoTableRows(
    request: Parameters<
      SystemApi['getFrontendVersionedServiceRepoTableRows']
    >[0],
  ): ReturnType<SystemApi['getFrontendVersionedServiceRepoTableRows']> {
    // 1 — run getFrontendVersionedServiceRepoTableRows with the retained admission error
    return Effect.runPromise(
      getFrontendVersionedServiceRepoTableRows({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getVersionedServiceRepos answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getVersionedServiceRepos(
    request: Parameters<SystemApi['getVersionedServiceRepos']>[0],
  ): ReturnType<SystemApi['getVersionedServiceRepos']> {
    // 1 — run getVersionedServiceRepos with the retained admission error
    return Effect.runPromise(
      getVersionedServiceRepos({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.getVersionedServiceRepoTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getVersionedServiceRepoTableRows(
    request: Parameters<SystemApi['getVersionedServiceRepoTableRows']>[0],
  ): ReturnType<SystemApi['getVersionedServiceRepoTableRows']> {
    // 1 — run getVersionedServiceRepoTableRows with the retained admission error
    return Effect.runPromise(
      getVersionedServiceRepoTableRows({
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
   * SystemApiFailure.getUserVersionedAggregateChains answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getUserVersionedAggregateChains(
    request: Parameters<SystemApi['getUserVersionedAggregateChains']>[0],
  ): ReturnType<SystemApi['getUserVersionedAggregateChains']> {
    // 1 — run getUserVersionedAggregateChains with the retained admission error
    return Effect.runPromise(
      getUserVersionedAggregateChains({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.getUserVersionedAggregateChainTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getUserVersionedAggregateChainTableRows(
    request: Parameters<
      SystemApi['getUserVersionedAggregateChainTableRows']
    >[0],
  ): ReturnType<SystemApi['getUserVersionedAggregateChainTableRows']> {
    // 1 — run getUserVersionedAggregateChainTableRows with the retained admission error
    return Effect.runPromise(
      getUserVersionedAggregateChainTableRows({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getVersionedAggregateChains answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getVersionedAggregateChains(
    request: Parameters<SystemApi['getVersionedAggregateChains']>[0],
  ): ReturnType<SystemApi['getVersionedAggregateChains']> {
    // 1 — run getVersionedAggregateChains with the retained admission error
    return Effect.runPromise(
      getVersionedAggregateChains({ request, error: this.error }),
    );
  }
  async getVersionedServiceChains(
    request: Parameters<SystemApi['getVersionedServiceChains']>[0],
  ): ReturnType<SystemApi['getVersionedServiceChains']> {
    // 1 — run getVersionedServiceChains with the retained admission error
    return Effect.runPromise(
      getVersionedServiceChains({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.getVersionedAggregateChainTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getVersionedAggregateChainTableRows(
    request: Parameters<SystemApi['getVersionedAggregateChainTableRows']>[0],
  ): ReturnType<SystemApi['getVersionedAggregateChainTableRows']> {
    // 1 — run getVersionedAggregateChainTableRows with the retained admission error
    return Effect.runPromise(
      getVersionedAggregateChainTableRows({
        request,
        error: this.error,
      }),
    );
  }
  async getVersionedServiceChainTableRows(
    request: Parameters<SystemApi['getVersionedServiceChainTableRows']>[0],
  ): ReturnType<SystemApi['getVersionedServiceChainTableRows']> {
    // 1 — run getVersionedServiceChainTableRows with the retained admission error
    return Effect.runPromise(
      getVersionedServiceChainTableRows({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getFrontendServiceChains answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getFrontendServiceChains(
    request: Parameters<SystemApi['getFrontendServiceChains']>[0],
  ): ReturnType<SystemApi['getFrontendServiceChains']> {
    // 1 — run getFrontendServiceChains with the retained admission error
    return Effect.runPromise(
      getFrontendServiceChains({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getFrontendServiceChainTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getFrontendServiceChainTableRows(
    request: Parameters<SystemApi['getFrontendServiceChainTableRows']>[0],
  ): ReturnType<SystemApi['getFrontendServiceChainTableRows']> {
    // 1 — run getFrontendServiceChainTableRows with the retained admission error
    return Effect.runPromise(
      getFrontendServiceChainTableRows({
        request,
        error: this.error,
      }),
    );
  }

  /*
   * SystemApiFailure.getServiceAdmittedChains answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceAdmittedChains(
    request: Parameters<SystemApi['getServiceAdmittedChains']>[0],
  ): ReturnType<SystemApi['getServiceAdmittedChains']> {
    // 1 — run getServiceAdmittedChains with the retained admission error
    return Effect.runPromise(
      getServiceAdmittedChains({ request, error: this.error }),
    );
  }

  /*
   * SystemApiFailure.getServiceAdmittedChainTableRows answers a rejected capability with its retained admission error.
   *
   * 1. Run the bound domain operation.
   */
  async getServiceAdmittedChainTableRows(
    request: Parameters<SystemApi['getServiceAdmittedChainTableRows']>[0],
  ): ReturnType<SystemApi['getServiceAdmittedChainTableRows']> {
    // 1 — run getServiceAdmittedChainTableRows with the retained admission error
    return Effect.runPromise(
      getServiceAdmittedChainTableRows({ request, error: this.error }),
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
