import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { SystemApi } from '../SystemApi.js';

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
import { getMaterializedAggregateFrontendRepos } from './getMaterializedAggregateFrontendRepos/getMaterializedAggregateFrontendRepos.js';
import { getMaterializedAggregateFrontendRepoTableRows } from './getMaterializedAggregateFrontendRepoTableRows/getMaterializedAggregateFrontendRepoTableRows.js';
import { getAggregateFrontendState } from './getAggregateFrontendState/getAggregateFrontendState.js';
import { getMaterializedAggregateRepos } from './getMaterializedAggregateRepos/getMaterializedAggregateRepos.js';
import { getMaterializedAggregateRepoTableRows } from './getMaterializedAggregateRepoTableRows/getMaterializedAggregateRepoTableRows.js';
import { getServiceCommandChains } from './getServiceCommandChains/getServiceCommandChains.js';
import { getServiceCommandChainTableRows } from './getServiceCommandChainTableRows/getServiceCommandChainTableRows.js';
import { getServiceFrontendFinalizedCommandChains } from './getServiceFrontendFinalizedCommandChains/getServiceFrontendFinalizedCommandChains.js';
import { getServiceFrontendFinalizedCommandChainTableRows } from './getServiceFrontendFinalizedCommandChainTableRows/getServiceFrontendFinalizedCommandChainTableRows.js';
import { getMaterializedServiceFrontendRepos } from './getMaterializedServiceFrontendRepos/getMaterializedServiceFrontendRepos.js';
import { getMaterializedServiceFrontendRepoTableRows } from './getMaterializedServiceFrontendRepoTableRows/getMaterializedServiceFrontendRepoTableRows.js';
import { getMaterializedServiceRepos } from './getMaterializedServiceRepos/getMaterializedServiceRepos.js';
import { getMaterializedServiceRepoTableRows } from './getMaterializedServiceRepoTableRows/getMaterializedServiceRepoTableRows.js';
import { getSystemLogRepos } from './getSystemLogRepos/getSystemLogRepos.js';
import { getSystemLogRepoTableRows } from './getSystemLogRepoTableRows/getSystemLogRepoTableRows.js';
import { getSystemRepos } from './getSystemRepos/getSystemRepos.js';
import { getSystemRepoTableRows } from './getSystemRepoTableRows/getSystemRepoTableRows.js';
import { healthcheck } from './healthcheck/healthcheck.js';
import { makeSystemSpec } from './makeSystemSpec/makeSystemSpec.js';

export class SystemApiFailure extends RpcTarget {
  constructor(private readonly error: IAnyError) {
    super();
  }

  async healthcheck(
    request: Parameters<SystemApi['healthcheck']>[0],
  ): ReturnType<SystemApi['healthcheck']> {
    return Effect.runPromise(healthcheck({ request, error: this.error }));
  }

  async getAggregateFrontendState(
    request: Parameters<SystemApi['getAggregateFrontendState']>[0],
  ): ReturnType<SystemApi['getAggregateFrontendState']> {
    return Effect.runPromise(
      getAggregateFrontendState({ request, error: this.error }),
    );
  }

  async executeServiceQuery(
    request: Parameters<SystemApi['executeServiceQuery']>[0],
  ): ReturnType<SystemApi['executeServiceQuery']> {
    return Effect.runPromise(
      executeServiceQuery({ request, error: this.error }),
    );
  }

  async finalizeAggregateCommand(
    request: Parameters<SystemApi['finalizeAggregateCommand']>[0],
  ): ReturnType<SystemApi['finalizeAggregateCommand']> {
    return Effect.runPromise(
      finalizeAggregateCommand({ request, error: this.error }),
    );
  }

  async executeSelectQuery(
    request: Parameters<SystemApi['executeSelectQuery']>[0],
  ): ReturnType<SystemApi['executeSelectQuery']> {
    return Effect.runPromise(
      executeSelectQuery({ request, error: this.error }),
    );
  }

  async finalizeServiceCommand(
    request: Parameters<SystemApi['finalizeServiceCommand']>[0],
  ): ReturnType<SystemApi['finalizeServiceCommand']> {
    return Effect.runPromise(
      finalizeServiceCommand({ request, error: this.error }),
    );
  }

  async getSystemRepos(
    request: Parameters<SystemApi['getSystemRepos']>[0],
  ): ReturnType<SystemApi['getSystemRepos']> {
    return Effect.runPromise(getSystemRepos({ request, error: this.error }));
  }

  async getSystemRepoTableRows(
    request: Parameters<SystemApi['getSystemRepoTableRows']>[0],
  ): ReturnType<SystemApi['getSystemRepoTableRows']> {
    return Effect.runPromise(
      getSystemRepoTableRows({ request, error: this.error }),
    );
  }

  async getMaterializedAggregateRepos(
    request: Parameters<SystemApi['getMaterializedAggregateRepos']>[0],
  ): ReturnType<SystemApi['getMaterializedAggregateRepos']> {
    return Effect.runPromise(getMaterializedAggregateRepos({ request, error: this.error }));
  }

  async getMaterializedAggregateRepoTableRows(
    request: Parameters<SystemApi['getMaterializedAggregateRepoTableRows']>[0],
  ): ReturnType<SystemApi['getMaterializedAggregateRepoTableRows']> {
    return Effect.runPromise(
      getMaterializedAggregateRepoTableRows({ request, error: this.error }),
    );
  }

  async getMaterializedAggregateFrontendRepos(
    request: Parameters<SystemApi['getMaterializedAggregateFrontendRepos']>[0],
  ): ReturnType<SystemApi['getMaterializedAggregateFrontendRepos']> {
    return Effect.runPromise(
      getMaterializedAggregateFrontendRepos({ request, error: this.error }),
    );
  }

  async getMaterializedAggregateFrontendRepoTableRows(
    request: Parameters<SystemApi['getMaterializedAggregateFrontendRepoTableRows']>[0],
  ): ReturnType<SystemApi['getMaterializedAggregateFrontendRepoTableRows']> {
    return Effect.runPromise(
      getMaterializedAggregateFrontendRepoTableRows({ request, error: this.error }),
    );
  }

  async getMaterializedServiceFrontendRepos(
    request: Parameters<SystemApi['getMaterializedServiceFrontendRepos']>[0],
  ): ReturnType<SystemApi['getMaterializedServiceFrontendRepos']> {
    return Effect.runPromise(
      getMaterializedServiceFrontendRepos({ request, error: this.error }),
    );
  }

  async getMaterializedServiceFrontendRepoTableRows(
    request: Parameters<SystemApi['getMaterializedServiceFrontendRepoTableRows']>[0],
  ): ReturnType<SystemApi['getMaterializedServiceFrontendRepoTableRows']> {
    return Effect.runPromise(
      getMaterializedServiceFrontendRepoTableRows({ request, error: this.error }),
    );
  }

  async getMaterializedServiceRepos(
    request: Parameters<SystemApi['getMaterializedServiceRepos']>[0],
  ): ReturnType<SystemApi['getMaterializedServiceRepos']> {
    return Effect.runPromise(getMaterializedServiceRepos({ request, error: this.error }));
  }

  async getMaterializedServiceRepoTableRows(
    request: Parameters<SystemApi['getMaterializedServiceRepoTableRows']>[0],
  ): ReturnType<SystemApi['getMaterializedServiceRepoTableRows']> {
    return Effect.runPromise(
      getMaterializedServiceRepoTableRows({ request, error: this.error }),
    );
  }

  async getAggregateCommandChains(
    request: Parameters<SystemApi['getAggregateCommandChains']>[0],
  ): ReturnType<SystemApi['getAggregateCommandChains']> {
    return Effect.runPromise(
      getAggregateCommandChains({ request, error: this.error }),
    );
  }

  async getAggregateCommandChainTableRows(
    request: Parameters<SystemApi['getAggregateCommandChainTableRows']>[0],
  ): ReturnType<SystemApi['getAggregateCommandChainTableRows']> {
    return Effect.runPromise(
      getAggregateCommandChainTableRows({ request, error: this.error }),
    );
  }

  async getAggregateFrontendFinalizedCommandChains(
    request: Parameters<SystemApi['getAggregateFrontendFinalizedCommandChains']>[0],
  ): ReturnType<SystemApi['getAggregateFrontendFinalizedCommandChains']> {
    return Effect.runPromise(
      getAggregateFrontendFinalizedCommandChains({ request, error: this.error }),
    );
  }

  async getAggregateFrontendFinalizedCommandChainTableRows(
    request: Parameters<SystemApi['getAggregateFrontendFinalizedCommandChainTableRows']>[0],
  ): ReturnType<SystemApi['getAggregateFrontendFinalizedCommandChainTableRows']> {
    return Effect.runPromise(
      getAggregateFrontendFinalizedCommandChainTableRows({ request, error: this.error }),
    );
  }

  async getAggregateFrontendPushedCommandChains(
    request: Parameters<SystemApi['getAggregateFrontendPushedCommandChains']>[0],
  ): ReturnType<SystemApi['getAggregateFrontendPushedCommandChains']> {
    return Effect.runPromise(
      getAggregateFrontendPushedCommandChains({ request, error: this.error }),
    );
  }

  async getAggregateFrontendPushedCommandChainTableRows(
    request: Parameters<SystemApi['getAggregateFrontendPushedCommandChainTableRows']>[0],
  ): ReturnType<SystemApi['getAggregateFrontendPushedCommandChainTableRows']> {
    return Effect.runPromise(
      getAggregateFrontendPushedCommandChainTableRows({
        request,
        error: this.error,
      }),
    );
  }

  async getServiceFrontendFinalizedCommandChains(
    request: Parameters<SystemApi['getServiceFrontendFinalizedCommandChains']>[0],
  ): ReturnType<SystemApi['getServiceFrontendFinalizedCommandChains']> {
    return Effect.runPromise(
      getServiceFrontendFinalizedCommandChains({ request, error: this.error }),
    );
  }

  async getServiceFrontendFinalizedCommandChainTableRows(
    request: Parameters<SystemApi['getServiceFrontendFinalizedCommandChainTableRows']>[0],
  ): ReturnType<SystemApi['getServiceFrontendFinalizedCommandChainTableRows']> {
    return Effect.runPromise(
      getServiceFrontendFinalizedCommandChainTableRows({
        request,
        error: this.error,
      }),
    );
  }

  async getServiceCommandChains(
    request: Parameters<SystemApi['getServiceCommandChains']>[0],
  ): ReturnType<SystemApi['getServiceCommandChains']> {
    return Effect.runPromise(
      getServiceCommandChains({ request, error: this.error }),
    );
  }

  async getServiceCommandChainTableRows(
    request: Parameters<SystemApi['getServiceCommandChainTableRows']>[0],
  ): ReturnType<SystemApi['getServiceCommandChainTableRows']> {
    return Effect.runPromise(
      getServiceCommandChainTableRows({ request, error: this.error }),
    );
  }

  async getSystemLogRepos(
    request: Parameters<SystemApi['getSystemLogRepos']>[0],
  ): ReturnType<SystemApi['getSystemLogRepos']> {
    return Effect.runPromise(getSystemLogRepos({ request, error: this.error }));
  }

  async getSystemLogRepoTableRows(
    request: Parameters<SystemApi['getSystemLogRepoTableRows']>[0],
  ): ReturnType<SystemApi['getSystemLogRepoTableRows']> {
    return Effect.runPromise(
      getSystemLogRepoTableRows({ request, error: this.error }),
    );
  }

  async makeSystemSpec(
    request: Parameters<SystemApi['makeSystemSpec']>[0],
  ): ReturnType<SystemApi['makeSystemSpec']> {
    return Effect.runPromise(makeSystemSpec({ request, error: this.error }));
  }
}
