import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';
import { BrandTypeId } from 'effect/Brand';

import type { SystemApi } from '../SystemApi.js';

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

export class SystemApiFailure extends RpcTarget {
  declare [BrandTypeId]: 'TargetApi';

  constructor(private readonly error: IAnyError) {
    super();
  }

  async hello(
    request: Parameters<SystemApi['hello']>[0],
  ): ReturnType<SystemApi['hello']> {
    return Effect.runPromise(hello({ request, error: this.error }));
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

  async finalizeAggregateCommands(
    request: Parameters<SystemApi['finalizeAggregateCommands']>[0],
  ): ReturnType<SystemApi['finalizeAggregateCommands']> {
    return Effect.runPromise(
      finalizeAggregateCommands({ request, error: this.error }),
    );
  }

  async executeSelectQuery(
    request: Parameters<SystemApi['executeSelectQuery']>[0],
  ): ReturnType<SystemApi['executeSelectQuery']> {
    return Effect.runPromise(
      executeSelectQuery({ request, error: this.error }),
    );
  }

  async finalizeServiceCommands(
    request: Parameters<SystemApi['finalizeServiceCommands']>[0],
  ): ReturnType<SystemApi['finalizeServiceCommands']> {
    return Effect.runPromise(
      finalizeServiceCommands({ request, error: this.error }),
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

  async getAggregateRepos(
    request: Parameters<SystemApi['getAggregateRepos']>[0],
  ): ReturnType<SystemApi['getAggregateRepos']> {
    return Effect.runPromise(getAggregateRepos({ request, error: this.error }));
  }

  async getAggregateRepoTableRows(
    request: Parameters<SystemApi['getAggregateRepoTableRows']>[0],
  ): ReturnType<SystemApi['getAggregateRepoTableRows']> {
    return Effect.runPromise(
      getAggregateRepoTableRows({ request, error: this.error }),
    );
  }

  async getAggregateFrontendRepos(
    request: Parameters<SystemApi['getAggregateFrontendRepos']>[0],
  ): ReturnType<SystemApi['getAggregateFrontendRepos']> {
    return Effect.runPromise(
      getAggregateFrontendRepos({ request, error: this.error }),
    );
  }

  async getAggregateFrontendRepoTableRows(
    request: Parameters<SystemApi['getAggregateFrontendRepoTableRows']>[0],
  ): ReturnType<SystemApi['getAggregateFrontendRepoTableRows']> {
    return Effect.runPromise(
      getAggregateFrontendRepoTableRows({ request, error: this.error }),
    );
  }

  async getServiceFrontendRepos(
    request: Parameters<SystemApi['getServiceFrontendRepos']>[0],
  ): ReturnType<SystemApi['getServiceFrontendRepos']> {
    return Effect.runPromise(
      getServiceFrontendRepos({ request, error: this.error }),
    );
  }

  async getServiceFrontendRepoTableRows(
    request: Parameters<SystemApi['getServiceFrontendRepoTableRows']>[0],
  ): ReturnType<SystemApi['getServiceFrontendRepoTableRows']> {
    return Effect.runPromise(
      getServiceFrontendRepoTableRows({ request, error: this.error }),
    );
  }

  async getServiceRepos(
    request: Parameters<SystemApi['getServiceRepos']>[0],
  ): ReturnType<SystemApi['getServiceRepos']> {
    return Effect.runPromise(getServiceRepos({ request, error: this.error }));
  }

  async getServiceRepoTableRows(
    request: Parameters<SystemApi['getServiceRepoTableRows']>[0],
  ): ReturnType<SystemApi['getServiceRepoTableRows']> {
    return Effect.runPromise(
      getServiceRepoTableRows({ request, error: this.error }),
    );
  }

  async getAggregateBlockRepos(
    request: Parameters<SystemApi['getAggregateBlockRepos']>[0],
  ): ReturnType<SystemApi['getAggregateBlockRepos']> {
    return Effect.runPromise(
      getAggregateBlockRepos({ request, error: this.error }),
    );
  }

  async getAggregateBlockRepoTableRows(
    request: Parameters<SystemApi['getAggregateBlockRepoTableRows']>[0],
  ): ReturnType<SystemApi['getAggregateBlockRepoTableRows']> {
    return Effect.runPromise(
      getAggregateBlockRepoTableRows({ request, error: this.error }),
    );
  }

  async getAggregateFrontendBlockRepos(
    request: Parameters<SystemApi['getAggregateFrontendBlockRepos']>[0],
  ): ReturnType<SystemApi['getAggregateFrontendBlockRepos']> {
    return Effect.runPromise(
      getAggregateFrontendBlockRepos({ request, error: this.error }),
    );
  }

  async getAggregateFrontendBlockRepoTableRows(
    request: Parameters<SystemApi['getAggregateFrontendBlockRepoTableRows']>[0],
  ): ReturnType<SystemApi['getAggregateFrontendBlockRepoTableRows']> {
    return Effect.runPromise(
      getAggregateFrontendBlockRepoTableRows({ request, error: this.error }),
    );
  }

  async getServiceFrontendBlockRepos(
    request: Parameters<SystemApi['getServiceFrontendBlockRepos']>[0],
  ): ReturnType<SystemApi['getServiceFrontendBlockRepos']> {
    return Effect.runPromise(
      getServiceFrontendBlockRepos({ request, error: this.error }),
    );
  }

  async getServiceFrontendBlockRepoTableRows(
    request: Parameters<SystemApi['getServiceFrontendBlockRepoTableRows']>[0],
  ): ReturnType<SystemApi['getServiceFrontendBlockRepoTableRows']> {
    return Effect.runPromise(
      getServiceFrontendBlockRepoTableRows({
        request,
        error: this.error,
      }),
    );
  }

  async getServiceBlockRepos(
    request: Parameters<SystemApi['getServiceBlockRepos']>[0],
  ): ReturnType<SystemApi['getServiceBlockRepos']> {
    return Effect.runPromise(
      getServiceBlockRepos({ request, error: this.error }),
    );
  }

  async getServiceBlockRepoTableRows(
    request: Parameters<SystemApi['getServiceBlockRepoTableRows']>[0],
  ): ReturnType<SystemApi['getServiceBlockRepoTableRows']> {
    return Effect.runPromise(
      getServiceBlockRepoTableRows({ request, error: this.error }),
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
