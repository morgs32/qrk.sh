import type { SystemApi } from './SystemApi.js';
import type { SystemApiFailure } from './SystemApiFailure/SystemApiFailure.js';

declare const systemApi: SystemApi;
declare const systemApiFailure: SystemApiFailure;
declare const systemApiUnion: SystemApi | SystemApiFailure;

const emptyRequest = {
  args: [],
  traceContext: null,
} satisfies Parameters<SystemApi['hello']>[0];

const frontendStateRequest = {
  args: [
    {
      actorRef: {
        aggregateId: 'acct_1',
        aggregateName: 'shopping',
        userId: 'user_1',
      },
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
  args: [
    {
      aggregateId: 'acct_1',
      aggregateName: 'shopping',
      commands: [],
    },
  ],
  traceContext: null,
} satisfies Parameters<SystemApi['finalizeAggregateCommands']>[0];

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
  args: [{ serviceName: 'catalog', commands: [] }],
  traceContext: null,
} satisfies Parameters<SystemApi['finalizeServiceCommands']>[0];

const repoTableRequest = {
  args: [{ repoName: 'repo', tableName: 'table' }],
  traceContext: null,
} satisfies Parameters<SystemApi['getSystemRepoTableRows']>[0];

void systemApi.hello(emptyRequest);
void systemApi.getAggregateFrontendState(frontendStateRequest);
void systemApi.executeServiceQuery(serviceQueryRequest);
void systemApi.finalizeAggregateCommands(finalizeAggregateRequest);
void systemApi.executeSelectQuery(selectQueryRequest);
void systemApi.finalizeServiceCommands(finalizeServiceRequest);
void systemApi.getSystemRepos(emptyRequest);
void systemApi.getSystemRepoTableRows(repoTableRequest);
void systemApi.getAggregateRepos(emptyRequest);
void systemApi.getAggregateRepoTableRows(repoTableRequest);
void systemApi.getAggregateFrontendRepos(emptyRequest);
void systemApi.getAggregateFrontendRepoTableRows(repoTableRequest);
void systemApi.getServiceFrontendRepos(emptyRequest);
void systemApi.getServiceFrontendRepoTableRows(repoTableRequest);
void systemApi.getServiceRepos(emptyRequest);
void systemApi.getServiceRepoTableRows(repoTableRequest);
void systemApi.getAggregateBlockRepos(emptyRequest);
void systemApi.getAggregateBlockRepoTableRows(repoTableRequest);
void systemApi.getAggregateFrontendBlockRepos(emptyRequest);
void systemApi.getAggregateFrontendBlockRepoTableRows(repoTableRequest);
void systemApi.getServiceFrontendBlockRepos(emptyRequest);
void systemApi.getServiceFrontendBlockRepoTableRows(repoTableRequest);
void systemApi.getServiceBlockRepos(emptyRequest);
void systemApi.getServiceBlockRepoTableRows(repoTableRequest);
void systemApi.getSystemLogRepos(emptyRequest);
void systemApi.getSystemLogRepoTableRows(repoTableRequest);
void systemApi.makeSystemSpec(emptyRequest);

void systemApiFailure.hello(emptyRequest);
void systemApiFailure.getAggregateFrontendState(frontendStateRequest);
void systemApiFailure.executeServiceQuery(serviceQueryRequest);
void systemApiFailure.finalizeAggregateCommands(finalizeAggregateRequest);
void systemApiFailure.executeSelectQuery(selectQueryRequest);
void systemApiFailure.finalizeServiceCommands(finalizeServiceRequest);
void systemApiFailure.getSystemRepos(emptyRequest);
void systemApiFailure.getSystemRepoTableRows(repoTableRequest);
void systemApiFailure.getAggregateRepos(emptyRequest);
void systemApiFailure.getAggregateRepoTableRows(repoTableRequest);
void systemApiFailure.getAggregateFrontendRepos(emptyRequest);
void systemApiFailure.getAggregateFrontendRepoTableRows(repoTableRequest);
void systemApiFailure.getServiceFrontendRepos(emptyRequest);
void systemApiFailure.getServiceFrontendRepoTableRows(repoTableRequest);
void systemApiFailure.getServiceRepos(emptyRequest);
void systemApiFailure.getServiceRepoTableRows(repoTableRequest);
void systemApiFailure.getAggregateBlockRepos(emptyRequest);
void systemApiFailure.getAggregateBlockRepoTableRows(repoTableRequest);
void systemApiFailure.getAggregateFrontendBlockRepos(emptyRequest);
void systemApiFailure.getAggregateFrontendBlockRepoTableRows(repoTableRequest);
void systemApiFailure.getServiceFrontendBlockRepos(emptyRequest);
void systemApiFailure.getServiceFrontendBlockRepoTableRows(repoTableRequest);
void systemApiFailure.getServiceBlockRepos(emptyRequest);
void systemApiFailure.getServiceBlockRepoTableRows(repoTableRequest);
void systemApiFailure.getSystemLogRepos(emptyRequest);
void systemApiFailure.getSystemLogRepoTableRows(repoTableRequest);
void systemApiFailure.makeSystemSpec(emptyRequest);

void systemApiUnion.hello(emptyRequest);
void systemApiUnion.getAggregateFrontendState(frontendStateRequest);
void systemApiUnion.getServiceFrontendRepos(emptyRequest);
void systemApiUnion.getServiceFrontendRepoTableRows(repoTableRequest);
void systemApiUnion.getServiceFrontendBlockRepos(emptyRequest);
void systemApiUnion.getServiceFrontendBlockRepoTableRows(repoTableRequest);
