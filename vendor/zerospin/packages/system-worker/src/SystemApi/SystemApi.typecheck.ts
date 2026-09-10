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
      aggregateVersion: '1.0.0',
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
  args: [
    {
      serviceName: 'catalog',
      serviceVersion: '1.0.0',
      queryName: 'list',
      params: null,
    },
  ],
  traceContext: null,
} satisfies Parameters<SystemApi['executeServiceQuery']>[0];

const finalizeAggregateRequest = {
  args: [{ command: aggregateCommand, aggregateVersion: '1.0.0' }],
  traceContext: null,
} satisfies Parameters<SystemApi['executeAggregateCommand']>[0];

const selectQueryRequest = {
  args: [
    {
      aggregateId: 'acct_1',
      aggregateName: 'shopping',
      aggregateVersion: '1.0.0',
      query: { method: 'all', params: [], rawSql: 'SELECT 1' },
    },
  ],
  traceContext: null,
} satisfies Parameters<SystemApi['executeSelectQuery']>[0];

const finalizeServiceRequest = {
  args: [{ command: serviceCommand, serviceVersion: '1.0.0' }],
  traceContext: null,
} satisfies Parameters<SystemApi['executeServiceCommand']>[0];

const repoTableRequest = {
  args: [{ repoName: 'repo', tableName: 'table' }],
  traceContext: null,
} satisfies Parameters<SystemApi['getSystemRepoTableRows']>[0];

void systemApi.healthcheck(emptyRequest);
void systemApi.getAggregateFrontendState(frontendStateRequest);
void systemApi.executeServiceQuery(serviceQueryRequest);
void systemApi.executeAggregateCommand(finalizeAggregateRequest);
void systemApi.executeSelectQuery(selectQueryRequest);
void systemApi.executeServiceCommand(finalizeServiceRequest);
void systemApi.getSystemRepos(emptyRequest);
void systemApi.getSystemRepoTableRows(repoTableRequest);
void systemApi.getVersionedAggregateRepos(emptyRequest);
void systemApi.getVersionedAggregateRepoTableRows(repoTableRequest);
void systemApi.getUserVersionedAggregateRepos(emptyRequest);
void systemApi.getUserVersionedAggregateRepoTableRows(repoTableRequest);
void systemApi.getFrontendVersionedServiceRepos(emptyRequest);
void systemApi.getFrontendVersionedServiceRepoTableRows(repoTableRequest);
void systemApi.getVersionedServiceRepos(emptyRequest);
void systemApi.getVersionedServiceRepoTableRows(repoTableRequest);
void systemApi.getAggregateChains(emptyRequest);
void systemApi.getAggregateChainTableRows(repoTableRequest);
void systemApi.getUserVersionedAggregateChains(emptyRequest);
void systemApi.getUserVersionedAggregateChainTableRows(repoTableRequest);
void systemApi.getVersionedAggregateChains(emptyRequest);
void systemApi.getVersionedAggregateChainTableRows(repoTableRequest);
void systemApi.getFrontendServiceChains(emptyRequest);
void systemApi.getFrontendServiceChainTableRows(repoTableRequest);
void systemApi.getServiceAdmittedChains(emptyRequest);
void systemApi.getServiceAdmittedChainTableRows(repoTableRequest);
void systemApi.getSystemLogRepos(emptyRequest);
void systemApi.getSystemLogRepoTableRows(repoTableRequest);
void systemApi.makeSystemSpec(emptyRequest);
void systemApi.checkSystemSpec(emptyRequest);
void systemApi.initialize(emptyRequest);

void systemApiFailure.healthcheck(emptyRequest);
void systemApiFailure.initialize(emptyRequest);
void systemApiFailure.getAggregateFrontendState(frontendStateRequest);
void systemApiFailure.executeServiceQuery(serviceQueryRequest);
void systemApiFailure.executeAggregateCommand(finalizeAggregateRequest);
void systemApiFailure.executeSelectQuery(selectQueryRequest);
void systemApiFailure.executeServiceCommand(finalizeServiceRequest);
void systemApiFailure.getSystemRepos(emptyRequest);
void systemApiFailure.getSystemRepoTableRows(repoTableRequest);
void systemApiFailure.getVersionedAggregateRepos(emptyRequest);
void systemApiFailure.getVersionedAggregateRepoTableRows(repoTableRequest);
void systemApiFailure.getUserVersionedAggregateRepos(emptyRequest);
void systemApiFailure.getUserVersionedAggregateRepoTableRows(repoTableRequest);
void systemApiFailure.getFrontendVersionedServiceRepos(emptyRequest);
void systemApiFailure.getFrontendVersionedServiceRepoTableRows(
  repoTableRequest,
);
void systemApiFailure.getVersionedServiceRepos(emptyRequest);
void systemApiFailure.getVersionedServiceRepoTableRows(repoTableRequest);
void systemApiFailure.getAggregateChains(emptyRequest);
void systemApiFailure.getAggregateChainTableRows(repoTableRequest);
void systemApiFailure.getUserVersionedAggregateChains(emptyRequest);
void systemApiFailure.getUserVersionedAggregateChainTableRows(repoTableRequest);
void systemApiFailure.getVersionedAggregateChains(emptyRequest);
void systemApiFailure.getVersionedAggregateChainTableRows(repoTableRequest);
void systemApiFailure.getFrontendServiceChains(emptyRequest);
void systemApiFailure.getFrontendServiceChainTableRows(repoTableRequest);
void systemApiFailure.getServiceAdmittedChains(emptyRequest);
void systemApiFailure.getServiceAdmittedChainTableRows(repoTableRequest);
void systemApiFailure.getSystemLogRepos(emptyRequest);
void systemApiFailure.getSystemLogRepoTableRows(repoTableRequest);
void systemApiFailure.makeSystemSpec(emptyRequest);
void systemApiFailure.checkSystemSpec(emptyRequest);

void systemApiUnion.healthcheck(emptyRequest);
void systemApiUnion.initialize(emptyRequest);
void systemApiUnion.getAggregateFrontendState(frontendStateRequest);
void systemApiUnion.getFrontendVersionedServiceRepos(emptyRequest);
void systemApiUnion.getFrontendVersionedServiceRepoTableRows(repoTableRequest);
void systemApiUnion.getFrontendServiceChains(emptyRequest);
void systemApiUnion.getFrontendServiceChainTableRows(repoTableRequest);
void systemApiUnion.getVersionedAggregateChains(emptyRequest);
void systemApiUnion.getVersionedAggregateChainTableRows(repoTableRequest);
