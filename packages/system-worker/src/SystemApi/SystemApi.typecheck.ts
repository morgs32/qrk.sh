import type {
  IAggregateCommand,
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';

import type { SystemApi } from './SystemApi.js';
import type { SystemApiFailure } from './SystemApiFailure/SystemApiFailure.js';

declare const systemApi: SystemApi;
declare const systemApiFailure: SystemApiFailure;
declare const systemApiUnion: SystemApi | SystemApiFailure;
declare const aggregateCommand: IEncodedCommand<IAggregateCommand>;
declare const serviceCommand: IEncodedCommand<IServiceCommand>;

const emptyRequest = {
  args: [],
  traceContext: null,
} satisfies Parameters<SystemApi['healthcheck']>[0];

const frontendStateRequest = {
  args: [
    {
      aggregateId: 'acct_1',
      aggregateName: 'shopping',
      userId: 'user_1',
      frontendName: 'web',
      aggregateFrontendLock: {
        systemName: 'shopping',
        frontendName: 'web',
        models: {},
        contracts: {},
      },
    },
  ],
  traceContext: null,
} satisfies Parameters<SystemApi['getAggregateFrontendState']>[0];

const serviceQueryRequest = {
  args: [{ serviceName: 'catalog', queryName: 'list', params: null }],
  traceContext: null,
} satisfies Parameters<SystemApi['executeServiceQuery']>[0];

const finalizeAggregateRequest = {
  args: [aggregateCommand],
  traceContext: null,
} satisfies Parameters<SystemApi['finalizeAggregateCommand']>[0];

const selectQueryRequest = {
  args: [
    {
      aggregateId: 'acct_1',
      aggregateName: 'shopping',
      query: { method: 'all', params: [], rawSql: 'SELECT 1' },
    },
  ],
  traceContext: null,
} satisfies Parameters<SystemApi['executeSelectQuery']>[0];

const finalizeServiceRequest = {
  args: [serviceCommand],
  traceContext: null,
} satisfies Parameters<SystemApi['finalizeServiceCommand']>[0];

const repoTableRequest = {
  args: [{ repoName: 'repo', tableName: 'table' }],
  traceContext: null,
} satisfies Parameters<SystemApi['getSystemRepoTableRows']>[0];

void systemApi.healthcheck(emptyRequest);
void systemApi.getAggregateFrontendState(frontendStateRequest);
void systemApi.executeServiceQuery(serviceQueryRequest);
void systemApi.finalizeAggregateCommand(finalizeAggregateRequest);
void systemApi.executeSelectQuery(selectQueryRequest);
void systemApi.finalizeServiceCommand(finalizeServiceRequest);
void systemApi.getSystemRepos(emptyRequest);
void systemApi.getSystemRepoTableRows(repoTableRequest);
void systemApi.getMaterializedAggregateRepos(emptyRequest);
void systemApi.getMaterializedAggregateRepoTableRows(repoTableRequest);
void systemApi.getMaterializedAggregateFrontendRepos(emptyRequest);
void systemApi.getMaterializedAggregateFrontendRepoTableRows(repoTableRequest);
void systemApi.getMaterializedServiceFrontendRepos(emptyRequest);
void systemApi.getMaterializedServiceFrontendRepoTableRows(repoTableRequest);
void systemApi.getMaterializedServiceRepos(emptyRequest);
void systemApi.getMaterializedServiceRepoTableRows(repoTableRequest);
void systemApi.getAggregateCommandChains(emptyRequest);
void systemApi.getAggregateCommandChainTableRows(repoTableRequest);
void systemApi.getAggregateFrontendFinalizedCommandChains(emptyRequest);
void systemApi.getAggregateFrontendFinalizedCommandChainTableRows(
  repoTableRequest,
);
void systemApi.getAggregateFrontendPushedCommandChains(emptyRequest);
void systemApi.getAggregateFrontendPushedCommandChainTableRows(
  repoTableRequest,
);
void systemApi.getServiceFrontendFinalizedCommandChains(emptyRequest);
void systemApi.getServiceFrontendFinalizedCommandChainTableRows(
  repoTableRequest,
);
void systemApi.getServiceCommandChains(emptyRequest);
void systemApi.getServiceCommandChainTableRows(repoTableRequest);
void systemApi.getSystemLogRepos(emptyRequest);
void systemApi.getSystemLogRepoTableRows(repoTableRequest);
void systemApi.makeSystemSpec(emptyRequest);

void systemApiFailure.healthcheck(emptyRequest);
void systemApiFailure.getAggregateFrontendState(frontendStateRequest);
void systemApiFailure.executeServiceQuery(serviceQueryRequest);
void systemApiFailure.finalizeAggregateCommand(finalizeAggregateRequest);
void systemApiFailure.executeSelectQuery(selectQueryRequest);
void systemApiFailure.finalizeServiceCommand(finalizeServiceRequest);
void systemApiFailure.getSystemRepos(emptyRequest);
void systemApiFailure.getSystemRepoTableRows(repoTableRequest);
void systemApiFailure.getMaterializedAggregateRepos(emptyRequest);
void systemApiFailure.getMaterializedAggregateRepoTableRows(repoTableRequest);
void systemApiFailure.getMaterializedAggregateFrontendRepos(emptyRequest);
void systemApiFailure.getMaterializedAggregateFrontendRepoTableRows(
  repoTableRequest,
);
void systemApiFailure.getMaterializedServiceFrontendRepos(emptyRequest);
void systemApiFailure.getMaterializedServiceFrontendRepoTableRows(
  repoTableRequest,
);
void systemApiFailure.getMaterializedServiceRepos(emptyRequest);
void systemApiFailure.getMaterializedServiceRepoTableRows(repoTableRequest);
void systemApiFailure.getAggregateCommandChains(emptyRequest);
void systemApiFailure.getAggregateCommandChainTableRows(repoTableRequest);
void systemApiFailure.getAggregateFrontendFinalizedCommandChains(emptyRequest);
void systemApiFailure.getAggregateFrontendFinalizedCommandChainTableRows(
  repoTableRequest,
);
void systemApiFailure.getAggregateFrontendPushedCommandChains(emptyRequest);
void systemApiFailure.getAggregateFrontendPushedCommandChainTableRows(
  repoTableRequest,
);
void systemApiFailure.getServiceFrontendFinalizedCommandChains(emptyRequest);
void systemApiFailure.getServiceFrontendFinalizedCommandChainTableRows(
  repoTableRequest,
);
void systemApiFailure.getServiceCommandChains(emptyRequest);
void systemApiFailure.getServiceCommandChainTableRows(repoTableRequest);
void systemApiFailure.getSystemLogRepos(emptyRequest);
void systemApiFailure.getSystemLogRepoTableRows(repoTableRequest);
void systemApiFailure.makeSystemSpec(emptyRequest);

void systemApiUnion.healthcheck(emptyRequest);
void systemApiUnion.getAggregateFrontendState(frontendStateRequest);
void systemApiUnion.getMaterializedServiceFrontendRepos(emptyRequest);
void systemApiUnion.getMaterializedServiceFrontendRepoTableRows(
  repoTableRequest,
);
void systemApiUnion.getServiceFrontendFinalizedCommandChains(emptyRequest);
void systemApiUnion.getServiceFrontendFinalizedCommandChainTableRows(
  repoTableRequest,
);
void systemApiUnion.getAggregateFrontendPushedCommandChains(emptyRequest);
void systemApiUnion.getAggregateFrontendPushedCommandChainTableRows(
  repoTableRequest,
);
