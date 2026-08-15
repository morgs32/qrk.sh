/*
 * SystemWorker is the static Durable Object/RPC boundary around one compiled
 * System runtime. Aggregate commands enter in the aggregate frontend lock that
 * created them and are upgraded by the runtime before canonical execution;
 * canonical resources are downgraded only when projected back to that exact
 * frontend lock.
 */

import type { IUserRef } from '@zerospin/core/aggregate/types';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type {
  IAggregateId,
  InferIdFromAbbreviation,
} from '@zerospin/core/models/types';
import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import type { IAggregateFrontendSyncState } from '@zerospin/core/session/types';
import type {
  IEncodedQuery,
  IRepoRegistration,
  IRepoTableData,
  ISystemLogRow,
  ISystemSpec,
} from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyErrorJson,
} from '@zerospin/error';
import type { ITelemetryBatch } from '@zerospin/logger';
import { env, WorkerEntrypoint } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import { AggregateBlockRepo } from './AggregateBlockRepo/AggregateBlockRepo.js';
import { AggregateFrontendBlockRepo } from './AggregateFrontendBlockRepo/AggregateFrontendBlockRepo.js';
import { AggregateFrontendRepo } from './AggregateFrontendRepo/AggregateFrontendRepo.js';
import { AggregateRepo } from './AggregateRepo/AggregateRepo.js';
import { getAggregateRepo } from './AggregateRepo/getAggregateRepo/getAggregateRepo.js';
import { appendTelemetryBatch } from './appendTelemetryBatch/appendTelemetryBatch.js';
import { authenticate } from './authenticate/authenticate.js';
import { authorizeAggregateFrontend } from './authorizeAggregateFrontend/authorizeAggregateFrontend.js';
import { authorizeServiceFrontend } from './authorizeServiceFrontend/authorizeServiceFrontend.js';
import { createAggregateFrontendWebSocketTicket } from './createAggregateFrontendWebSocketTicket/createAggregateFrontendWebSocketTicket.js';
import { createServiceFrontendWebSocketTicket } from './createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.js';
import { executeAggregateQuery } from './executeAggregateQuery/executeAggregateQuery.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getAggregateFrontendState } from './getAggregateFrontendState/getAggregateFrontendState.js';
import { getServiceFrontendState } from './getServiceFrontendState/getServiceFrontendState.js';
import { getSystemSpec } from './getSystemSpec/getSystemSpec.js';
import { managedRuntime } from './managedRuntime.js';
import { ServiceBlockRepo } from './ServiceBlockRepo/ServiceBlockRepo.js';
import { ServiceFrontendBlockRepo } from './ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.js';
import { ServiceFrontendRepo } from './ServiceFrontendRepo/ServiceFrontendRepo.js';
import { ServiceRepo } from './ServiceRepo/ServiceRepo.js';
import { getSystemLogRepo } from './SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
import { SystemLogRepo } from './SystemLogRepo/SystemLogRepo.js';
import { SystemRepo } from './SystemRepo/SystemRepo.js';

export { AggregateBlockRepo };
export { AggregateRepo };
export { AggregateFrontendRepo };
export { AggregateFrontendBlockRepo };
export { SystemLogAgent } from './SystemLogAgent/SystemLogAgent.js';
export { SystemLogRepo };
export { ServiceRepo };
export { ServiceBlockRepo };
export { ServiceFrontendRepo };
export { ServiceFrontendBlockRepo };
export { SystemRepo };

export class SystemWorker extends WorkerEntrypoint {
  authenticate(props: {
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    signature: unknown;
  }) {
    return managedRuntime.runPromise(
      authenticate(props).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  authorizeAggregateFrontend(props: {
    generationId: string;
    userId: string;
    aggregateId: IAggregateId;
    aggregateName: string;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  }) {
    return managedRuntime.runPromise(
      authorizeAggregateFrontend(props).pipe(
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }

  authorizeServiceFrontend(props: {
    generationId: string;
    userId: string;
    serviceName: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  }) {
    return managedRuntime.runPromise(
      authorizeServiceFrontend(props).pipe(
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }

  getAggregateFrontendState(props: {
    generationId: string;
    actorRef: IUserRef;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  }): Promise<
    Schema.EitherEncoded<IAggregateFrontendSyncState, IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      getAggregateFrontendState(props).pipe(
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }

  getServiceFrontendState(props: {
    generationId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  }): Promise<Schema.EitherEncoded<IServiceFrontendState, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      getServiceFrontendState(props).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  createAggregateFrontendWebSocketTicket(props: {
    generationId: string;
    actorRef: IUserRef;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  }) {
    return managedRuntime.runPromise(
      createAggregateFrontendWebSocketTicket({
        ...props,
        configuredSystemId: env.ZEROSPIN_SYSTEM_ID,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  createServiceFrontendWebSocketTicket(props: {
    generationId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  }) {
    return managedRuntime.runPromise(
      createServiceFrontendWebSocketTicket({
        ...props,
        configuredSystemId: env.ZEROSPIN_SYSTEM_ID,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  executeServiceQuery(props: {
    generationId: string;
    actorRef?: IUserRef;
    frontendName?: string;
    aggregateFrontendLock?: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    serviceName: string;
    queryName: string;
    params: unknown;
  }): Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      executeServiceQuery(props).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  executeAggregateQuery(props: {
    generationId: string;
    actorRef: IUserRef;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    queryName: string;
    params: unknown;
  }): Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      executeAggregateQuery(props).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  executeSelectQuery(props: {
    generationId: string;
    aggregateId: IAggregateId;
    aggregateName: string;
    query: IEncodedQuery;
  }): Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            systemId: env.ZEROSPIN_SYSTEM_ID,
          }).assertGenerationAdmission({
            generationId: props.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const aggregateRepo = yield* getAggregateRepo({
          key: {
            generationId: props.generationId,
            aggregateId: props.aggregateId,
            aggregateName: props.aggregateName,
          },
        });
        const encodedUnknown = yield* makeAsync(() =>
          aggregateRepo.executeSelectQuery({
            aggregateName: props.aggregateName,
            query: props.query,
          }),
        );
        const encoded = yield* Schema.decodeUnknown(
          Schema.Union(
            Schema.Struct({
              _tag: Schema.Literal('Right'),
              right: Schema.Unknown,
            }),
            Schema.Struct({
              _tag: Schema.Literal('Left'),
              left: Schema.encodedSchema(ZerospinError.schema),
            }),
          ),
        )(encodedUnknown).pipe(
          mapParseError({
            code: 'aggregate-select-query-rpc-invalid',
            prefix: 'Failed to decode AggregateRepo select-query RPC',
          }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  appendTelemetryBatch(props: {
    batch: ITelemetryBatch;
    generationId: string;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      appendTelemetryBatch(props).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getSystemRepos(props: {
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId: props.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId: props.generationId,
            repoType: 'SystemRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getSystemRepoTableRows(props: {
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const { generationId, repoName, tableName } = props;
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId,
            repoType: 'SystemRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `SystemRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'SystemRepo' },
          });
        }
        return yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => systemRepo.getRepoTableRows({ generationId, tableName })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAggregateRepos(props: {
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId: props.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId: props.generationId,
            repoType: 'AggregateRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAggregateRepoTableRows(props: {
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const { generationId, repoName, tableName } = props;
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId,
            repoType: 'AggregateRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `AggregateRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'AggregateRepo' },
          });
        }
        const repo = env.AGGREGATE_REPO.getByName(repoName);
        return yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAggregateFrontendRepos(props: {
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId: props.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId: props.generationId,
            repoType: 'AggregateFrontendRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAggregateFrontendRepoTableRows(props: {
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const { generationId, repoName, tableName } = props;
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId,
            repoType: 'AggregateFrontendRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `AggregateFrontendRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'AggregateFrontendRepo' },
          });
        }
        const repo = env.AGGREGATE_FRONTEND_REPO.getByName(repoName);
        return yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getServiceRepos(props: {
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId: props.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId: props.generationId,
            repoType: 'ServiceRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getServiceRepoTableRows(props: {
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const { generationId, repoName, tableName } = props;
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId,
            repoType: 'ServiceRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `ServiceRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'ServiceRepo' },
          });
        }
        const repo = env.SERVICE_REPO.getByName(repoName);
        return yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAggregateBlockRepos(props: {
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId: props.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId: props.generationId,
            repoType: 'AggregateBlockRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAggregateBlockRepoTableRows(props: {
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const { generationId, repoName, tableName } = props;
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId,
            repoType: 'AggregateBlockRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `AggregateBlockRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'AggregateBlockRepo' },
          });
        }
        const repo = env.AGGREGATE_BLOCK_REPO.getByName(repoName);
        return yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAggregateFrontendBlockRepos(props: {
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId: props.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId: props.generationId,
            repoType: 'AggregateFrontendBlockRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAggregateFrontendBlockRepoTableRows(props: {
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const { generationId, repoName, tableName } = props;
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId,
            repoType: 'AggregateFrontendBlockRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `AggregateFrontendBlockRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'AggregateFrontendBlockRepo' },
          });
        }
        const repo = env.AGGREGATE_FRONTEND_BLOCK_REPO.getByName(repoName);
        return yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getServiceBlockRepos(props: {
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId: props.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId: props.generationId,
            repoType: 'ServiceBlockRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getServiceBlockRepoTableRows(props: {
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const { generationId, repoName, tableName } = props;
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId,
            repoType: 'ServiceBlockRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `ServiceBlockRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'ServiceBlockRepo' },
          });
        }
        const repo = env.SERVICE_BLOCK_REPO.getByName(repoName);
        return yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getServiceFrontendRepos(props: {
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId: props.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId: props.generationId,
            repoType: 'ServiceFrontendRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getServiceFrontendRepoTableRows(props: {
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const { generationId, repoName, tableName } = props;
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId,
            repoType: 'ServiceFrontendRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `ServiceFrontendRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'ServiceFrontendRepo' },
          });
        }
        const repo = env.SERVICE_FRONTEND_REPO.getByName(repoName);
        return yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getServiceFrontendBlockRepos(props: {
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId: props.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId: props.generationId,
            repoType: 'ServiceFrontendBlockRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getServiceFrontendBlockRepoTableRows(props: {
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const { generationId, repoName, tableName } = props;
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId,
            repoType: 'ServiceFrontendBlockRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `ServiceFrontendBlockRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'ServiceFrontendBlockRepo' },
          });
        }
        const repo = env.SERVICE_FRONTEND_BLOCK_REPO.getByName(repoName);
        return yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getSystemLogRepos(props: {
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId: props.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId: props.generationId,
            repoType: 'SystemLogRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getSystemLogRepoTableRows(props: {
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const { generationId, repoName, tableName } = props;
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId,
            repoType: 'SystemLogRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `SystemLogRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'SystemLogRepo' },
          });
        }
        const repo = env.SYSTEM_LOG_REPO.getByName(repoName);
        return yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getSystemLogRows(props: {
    generationId: string;
    limit: number;
  }): Promise<Schema.EitherEncoded<readonly ISystemLogRow[], IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            systemId: env.ZEROSPIN_SYSTEM_ID,
          }).assertGenerationAdmission({
            generationId: props.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const systemLogRepo = yield* getSystemLogRepo({
          key: { generationId: props.generationId },
        });
        return yield* makeAsync<
          Schema.EitherEncoded<readonly ISystemLogRow[], IAnyErrorJson>
        >(() => systemLogRepo.getSystemLogRows({ limit: props.limit })).pipe(
          Effect.flatMap(decodeRpc),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getSystemSpec(): Promise<Schema.EitherEncoded<ISystemSpec, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      getSystemSpec().pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAggregateIds(props: {
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly InferIdFromAbbreviation[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            generationId: props.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* makeAsync(() =>
          systemRepo.getAggregateIds({ generationId: props.generationId }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async hello(props: {
    generationId: string;
  }): Promise<Schema.EitherEncoded<string, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            systemId: env.ZEROSPIN_SYSTEM_ID,
          }).assertGenerationAdmission({
            generationId: props.generationId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return 'Hello from SystemWorker';
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
}

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint
export default SystemWorker;
