import type {
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedAccountCommand,
  IExecutedServiceCommand,
  IFailedAccountCommand,
  IFailedServiceCommand,
} from '@zerospin/core/contracts/types';
import type { IAccountCursor } from '@zerospin/core/models/types';
import type { IFrontendState } from '@zerospin/core/session/types';
import type {
  IRepoRegistration,
  IRepoTableData,
  ISystemSpec,
} from '@zerospin/core/system/types';
import { type newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import type { IAnyError, IAnyErrorJson } from '@zerospin/error';
import {
  makeTraceableApiTarget,
  type ILinkedRpcEnvelope,
  type IRpcRequest,
  type TelemetryCollector,
} from '@zerospin/logger';
import type { Effect } from 'effect';

import type { ZerospinApis } from '../ZerospinApis/ZerospinApis';

import type { SystemApi } from './SystemApi';
import type { SystemApiFailure } from './SystemApiFailure';

declare const systemApi: SystemApi;
declare const systemApiFailure: SystemApiFailure;
declare const systemApiUnion: SystemApi | SystemApiFailure;
declare const syncSession: ReturnType<typeof newSyncRpcSession<ZerospinApis>>;

const emptyRequest = {
  args: [],
  traceContext: null,
} satisfies IRpcRequest<[]>;
const frontendStateRequest = {
  args: [
    {
      accountId: 'acct_1',
      accountName: 'main',
      actorId: 'actr_1',
      actorName: 'user',
      frontendName: 'default',
    },
  ],
  traceContext: null,
} satisfies IRpcRequest<
  [
    {
      accountId: string;
      accountName: string;
      actorId: `actr_${string}`;
      actorName: string;
      frontendName: string;
    },
  ]
>;
const serviceQueryRequest = {
  args: [
    {
      serviceName: 'products',
      queryName: 'getProducts',
      params: null,
    },
  ],
  traceContext: null,
} satisfies IRpcRequest<
  [{ serviceName: string; queryName: string; params: unknown }]
>;
const accountFinalizeRequest = {
  args: [
    {
      accountId: 'acct_1',
      accountName: 'main',
      commands: [],
    },
  ],
  traceContext: null,
} satisfies Parameters<SystemApi['finalizeAccountCommands']>[0];
const selectQueryRequest = {
  args: [
    {
      accountId: 'acct_1',
      accountName: 'main',
      query: {
        method: 'all',
        params: [],
        rawSql: 'select 1',
      },
    },
  ],
  traceContext: null,
} satisfies Parameters<SystemApi['executeSelectQuery']>[0];
const serviceFinalizeRequest = {
  args: [
    {
      serviceName: 'products',
      commands: [],
    },
  ],
  traceContext: null,
} satisfies Parameters<SystemApi['finalizeServiceCommands']>[0];
const repoTableRequest = {
  args: [{ repoName: 'repo', tableName: 'rows' }],
  traceContext: null,
} satisfies IRpcRequest<[{ repoName: string; tableName: string }]>;

const helloEnvelope = systemApi.hello(emptyRequest) satisfies Promise<
  ILinkedRpcEnvelope<string, IAnyErrorJson>
>;
const getFrontendStateEnvelope = systemApi.getFrontendState(
  frontendStateRequest,
) satisfies Promise<ILinkedRpcEnvelope<IFrontendState, IAnyErrorJson>>;
const executeServiceQueryEnvelope = systemApi.executeServiceQuery(
  serviceQueryRequest,
) satisfies Promise<ILinkedRpcEnvelope<unknown, IAnyErrorJson>>;
const finalizeAccountCommandsEnvelope =
  systemApi.finalizeAccountCommands(accountFinalizeRequest) satisfies Promise<
    ILinkedRpcEnvelope<
      Readonly<{
        executedCommands: readonly IEncodedCommand<IExecutedAccountCommand>[];
        failedCommands: readonly IEncodedCommand<IFailedAccountCommand>[];
        appliedMutations: readonly IEncodedAppliedMutation[];
        lastAccountCursor: IAccountCursor;
        accountIndex: number;
        failure: IAnyError | null;
      }>,
      IAnyErrorJson
    >
  >;
const executeSelectQueryEnvelope = systemApi.executeSelectQuery(
  selectQueryRequest,
) satisfies Promise<ILinkedRpcEnvelope<unknown, IAnyErrorJson>>;
const finalizeServiceCommandsEnvelope =
  systemApi.finalizeServiceCommands(serviceFinalizeRequest) satisfies Promise<
    ILinkedRpcEnvelope<
      {
        executed: readonly IExecutedServiceCommand[];
        failed: readonly IFailedServiceCommand[];
      },
      IAnyErrorJson
    >
  >;
const getSystemReposEnvelope = systemApi.getSystemRepos(
  emptyRequest,
) satisfies Promise<
  ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
>;
const getSystemRepoTableRowsEnvelope = systemApi.getSystemRepoTableRows(
  repoTableRequest,
) satisfies Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>>;
const getAccountReposEnvelope = systemApi.getAccountRepos(
  emptyRequest,
) satisfies Promise<
  ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
>;
const getAccountRepoTableRowsEnvelope = systemApi.getAccountRepoTableRows(
  repoTableRequest,
) satisfies Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>>;
const getAuthorizationReposEnvelope = systemApi.getAuthorizationRepos(
  emptyRequest,
) satisfies Promise<
  ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
>;
const getAuthorizationRepoTableRowsEnvelope =
  systemApi.getAuthorizationRepoTableRows(repoTableRequest) satisfies Promise<
    ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>
  >;
const getActorReposEnvelope = systemApi.getActorRepos(
  emptyRequest,
) satisfies Promise<
  ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
>;
const getActorRepoTableRowsEnvelope = systemApi.getActorRepoTableRows(
  repoTableRequest,
) satisfies Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>>;
const getFrontendReposEnvelope = systemApi.getFrontendRepos(
  emptyRequest,
) satisfies Promise<
  ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
>;
const getFrontendRepoTableRowsEnvelope = systemApi.getFrontendRepoTableRows(
  repoTableRequest,
) satisfies Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>>;
const getServiceReposEnvelope = systemApi.getServiceRepos(
  emptyRequest,
) satisfies Promise<
  ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
>;
const getServiceRepoTableRowsEnvelope = systemApi.getServiceRepoTableRows(
  repoTableRequest,
) satisfies Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>>;
const getAccountBlockReposEnvelope = systemApi.getAccountBlockRepos(
  emptyRequest,
) satisfies Promise<
  ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
>;
const getAccountBlockRepoTableRowsEnvelope =
  systemApi.getAccountBlockRepoTableRows(repoTableRequest) satisfies Promise<
    ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>
  >;
const getActorBlockReposEnvelope = systemApi.getActorBlockRepos(
  emptyRequest,
) satisfies Promise<
  ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
>;
const getActorBlockRepoTableRowsEnvelope =
  systemApi.getActorBlockRepoTableRows(repoTableRequest) satisfies Promise<
    ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>
  >;
const getFrontendBlockReposEnvelope = systemApi.getFrontendBlockRepos(
  emptyRequest,
) satisfies Promise<
  ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
>;
const getFrontendBlockRepoTableRowsEnvelope =
  systemApi.getFrontendBlockRepoTableRows(repoTableRequest) satisfies Promise<
    ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>
  >;
const getServiceBlockReposEnvelope = systemApi.getServiceBlockRepos(
  emptyRequest,
) satisfies Promise<
  ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
>;
const getServiceBlockRepoTableRowsEnvelope =
  systemApi.getServiceBlockRepoTableRows(repoTableRequest) satisfies Promise<
    ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>
  >;
const getSystemLogReposEnvelope = systemApi.getSystemLogRepos(
  emptyRequest,
) satisfies Promise<
  ILinkedRpcEnvelope<readonly IRepoRegistration[], IAnyErrorJson>
>;
const getSystemLogRepoTableRowsEnvelope = systemApi.getSystemLogRepoTableRows(
  repoTableRequest,
) satisfies Promise<ILinkedRpcEnvelope<IRepoTableData, IAnyErrorJson>>;
const makeSystemSpecEnvelope = systemApi.makeSystemSpec(
  emptyRequest,
) satisfies Promise<ILinkedRpcEnvelope<ISystemSpec, IAnyErrorJson>>;

void helloEnvelope;
void getFrontendStateEnvelope;
void executeServiceQueryEnvelope;
void finalizeAccountCommandsEnvelope;
void executeSelectQueryEnvelope;
void finalizeServiceCommandsEnvelope;
void getSystemReposEnvelope;
void getSystemRepoTableRowsEnvelope;
void getAccountReposEnvelope;
void getAccountRepoTableRowsEnvelope;
void getAuthorizationReposEnvelope;
void getAuthorizationRepoTableRowsEnvelope;
void getActorReposEnvelope;
void getActorRepoTableRowsEnvelope;
void getFrontendReposEnvelope;
void getFrontendRepoTableRowsEnvelope;
void getServiceReposEnvelope;
void getServiceRepoTableRowsEnvelope;
void getAccountBlockReposEnvelope;
void getAccountBlockRepoTableRowsEnvelope;
void getActorBlockReposEnvelope;
void getActorBlockRepoTableRowsEnvelope;
void getFrontendBlockReposEnvelope;
void getFrontendBlockRepoTableRowsEnvelope;
void getServiceBlockReposEnvelope;
void getServiceBlockRepoTableRowsEnvelope;
void getSystemLogReposEnvelope;
void getSystemLogRepoTableRowsEnvelope;
void makeSystemSpecEnvelope;

void systemApiFailure.hello(emptyRequest);
void systemApiFailure.getFrontendState(frontendStateRequest);
void systemApiFailure.executeServiceQuery(serviceQueryRequest);
void systemApiFailure.finalizeAccountCommands(accountFinalizeRequest);
void systemApiFailure.executeSelectQuery(selectQueryRequest);
void systemApiFailure.finalizeServiceCommands(serviceFinalizeRequest);
void systemApiFailure.getSystemRepos(emptyRequest);
void systemApiFailure.getSystemRepoTableRows(repoTableRequest);
void systemApiFailure.getAccountRepos(emptyRequest);
void systemApiFailure.getAccountRepoTableRows(repoTableRequest);
void systemApiFailure.getAuthorizationRepos(emptyRequest);
void systemApiFailure.getAuthorizationRepoTableRows(repoTableRequest);
void systemApiFailure.getActorRepos(emptyRequest);
void systemApiFailure.getActorRepoTableRows(repoTableRequest);
void systemApiFailure.getFrontendRepos(emptyRequest);
void systemApiFailure.getFrontendRepoTableRows(repoTableRequest);
void systemApiFailure.getServiceRepos(emptyRequest);
void systemApiFailure.getServiceRepoTableRows(repoTableRequest);
void systemApiFailure.getAccountBlockRepos(emptyRequest);
void systemApiFailure.getAccountBlockRepoTableRows(repoTableRequest);
void systemApiFailure.getActorBlockRepos(emptyRequest);
void systemApiFailure.getActorBlockRepoTableRows(repoTableRequest);
void systemApiFailure.getFrontendBlockRepos(emptyRequest);
void systemApiFailure.getFrontendBlockRepoTableRows(repoTableRequest);
void systemApiFailure.getServiceBlockRepos(emptyRequest);
void systemApiFailure.getServiceBlockRepoTableRows(repoTableRequest);
void systemApiFailure.getSystemLogRepos(emptyRequest);
void systemApiFailure.getSystemLogRepoTableRows(repoTableRequest);
void systemApiFailure.makeSystemSpec(emptyRequest);

void systemApiUnion.hello(emptyRequest);
void systemApiUnion.getFrontendState(frontendStateRequest);
void systemApiUnion.executeServiceQuery(serviceQueryRequest);
void systemApiUnion.finalizeAccountCommands(accountFinalizeRequest);
void systemApiUnion.executeSelectQuery(selectQueryRequest);
void systemApiUnion.finalizeServiceCommands(serviceFinalizeRequest);
void systemApiUnion.getSystemRepos(emptyRequest);
void systemApiUnion.getSystemRepoTableRows(repoTableRequest);
void systemApiUnion.getAccountRepos(emptyRequest);
void systemApiUnion.getAccountRepoTableRows(repoTableRequest);
void systemApiUnion.getAuthorizationRepos(emptyRequest);
void systemApiUnion.getAuthorizationRepoTableRows(repoTableRequest);
void systemApiUnion.getActorRepos(emptyRequest);
void systemApiUnion.getActorRepoTableRows(repoTableRequest);
void systemApiUnion.getFrontendRepos(emptyRequest);
void systemApiUnion.getFrontendRepoTableRows(repoTableRequest);
void systemApiUnion.getServiceRepos(emptyRequest);
void systemApiUnion.getServiceRepoTableRows(repoTableRequest);
void systemApiUnion.getAccountBlockRepos(emptyRequest);
void systemApiUnion.getAccountBlockRepoTableRows(repoTableRequest);
void systemApiUnion.getActorBlockRepos(emptyRequest);
void systemApiUnion.getActorBlockRepoTableRows(repoTableRequest);
void systemApiUnion.getFrontendBlockRepos(emptyRequest);
void systemApiUnion.getFrontendBlockRepoTableRows(repoTableRequest);
void systemApiUnion.getServiceBlockRepos(emptyRequest);
void systemApiUnion.getServiceBlockRepoTableRows(repoTableRequest);
void systemApiUnion.getSystemLogRepos(emptyRequest);
void systemApiUnion.getSystemLogRepoTableRows(repoTableRequest);
void systemApiUnion.makeSystemSpec(emptyRequest);

const tracedSystemApi = makeTraceableApiTarget(systemApiUnion);
const tracedHello = tracedSystemApi.hello() satisfies Effect.Effect<
  string,
  IAnyErrorJson | Error,
  TelemetryCollector
>;
void tracedHello;
void tracedSystemApi.getFrontendState(frontendStateRequest.args[0]);
void tracedSystemApi.executeServiceQuery(serviceQueryRequest.args[0]);
void tracedSystemApi.finalizeAccountCommands(accountFinalizeRequest.args[0]);
void tracedSystemApi.executeSelectQuery(selectQueryRequest.args[0]);
void tracedSystemApi.finalizeServiceCommands(serviceFinalizeRequest.args[0]);
void tracedSystemApi.getSystemRepos();
void tracedSystemApi.getSystemRepoTableRows(repoTableRequest.args[0]);
void tracedSystemApi.getAccountRepos();
void tracedSystemApi.getAccountRepoTableRows(repoTableRequest.args[0]);
void tracedSystemApi.getAuthorizationRepos();
void tracedSystemApi.getAuthorizationRepoTableRows(repoTableRequest.args[0]);
void tracedSystemApi.getActorRepos();
void tracedSystemApi.getActorRepoTableRows(repoTableRequest.args[0]);
void tracedSystemApi.getFrontendRepos();
void tracedSystemApi.getFrontendRepoTableRows(repoTableRequest.args[0]);
void tracedSystemApi.getServiceRepos();
void tracedSystemApi.getServiceRepoTableRows(repoTableRequest.args[0]);
void tracedSystemApi.getAccountBlockRepos();
void tracedSystemApi.getAccountBlockRepoTableRows(repoTableRequest.args[0]);
void tracedSystemApi.getActorBlockRepos();
void tracedSystemApi.getActorBlockRepoTableRows(repoTableRequest.args[0]);
void tracedSystemApi.getFrontendBlockRepos();
void tracedSystemApi.getFrontendBlockRepoTableRows(repoTableRequest.args[0]);
void tracedSystemApi.getServiceBlockRepos();
void tracedSystemApi.getServiceBlockRepoTableRows(repoTableRequest.args[0]);
void tracedSystemApi.getSystemLogRepos();
void tracedSystemApi.getSystemLogRepoTableRows(repoTableRequest.args[0]);
void tracedSystemApi.makeSystemSpec();

const sessionSystemApi = syncSession.getSystemApi({
  zerospinSecretKey: 'secret',
});
void sessionSystemApi.hello(emptyRequest);

// @ts-expect-error getSystemApi is synchronous in a sync RPC session.
const systemApiPromise: Promise<SystemApi | SystemApiFailure> =
  syncSession.getSystemApi({ zerospinSecretKey: 'secret' });
void systemApiPromise;

// @ts-expect-error getAccountResources is not part of the SystemApi surface.
void systemApi.getAccountResources;
