/*
 * System-worker annotation:
 * Defines the SystemWorker Durable Object entrypoint and its public RPC boundary.
 * The methods here should stay thin: decode inputs, delegate to same-named repo effects, and return encoded results.
 */

import { getFrontendController } from '@zerospin/core/accountController/getFrontendController';
import type {
  IActor,
  IAnyActorApi,
} from '@zerospin/core/actorController/types';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type {
  IAccountCommand,
  IDeploySeedCommand,
  IEncodedCommand,
  IExecutedServiceCommand,
  IFailedServiceCommand,
  IFailedStagedCommand,
  IPushedCommand,
  IServiceCommand,
  IStagedCommand,
} from '@zerospin/core/contracts/types';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type {
  IAccountId,
  IActorId,
  InferIdFromAbbreviation,
} from '@zerospin/core/models/types';
import type { makeServiceFrontendControllerSpec } from '@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec';
import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import { FrontendSyncStateSchema } from '@zerospin/core/session/FrontendBlockSchema';
import type { IFrontendSyncState } from '@zerospin/core/session/types';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import type {
  IEncodedQuery,
  IRepoRegistration,
  IRepoTableData,
  ISystemId,
  ISystemLogLevel,
  ISystemLogRow,
  ISystemSpec,
} from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { defaultRetrySchedule } from '@zerospin/core/utils/defaultRetrySchedule';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  mapParseError,
  ZerospinError,
  type IAnyErrorJson,
} from '@zerospin/error';
import {
  makeRpcHandler,
  makeTraceableRpcTarget,
  type IRpcEnvelope,
  type IRpcRequest,
  type ITelemetryBatch,
} from '@zerospin/logger';
import { DurableObject, env, WorkerEntrypoint } from 'cloudflare:workers';
import { Cause, Effect, Either, Schema } from 'effect';
import { isEqual } from 'es-toolkit';
import { system } from 'system';

import type { AccountRepo } from './AccountRepo/AccountRepo.js';
import { getAccountRepo } from './AccountRepo/getAccountRepo/getAccountRepo.js';
import { getActorRepo } from './ActorRepo/getActorRepo/getActorRepo.js';
import { authenticateServiceFrontend } from './authenticateServiceFrontend/authenticateServiceFrontend.js';
import { getAuthorizationRepo } from './AuthorizationRepo/getAuthorizationRepo/getAuthorizationRepo.js';
import { createFrontendWebSocketTicket } from './createFrontendWebSocketTicket/createFrontendWebSocketTicket.js';
import { createServiceFrontendWebSocketTicket } from './createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { getFrontendRepo } from './FrontendRepo/getFrontendRepo/getFrontendRepo.js';
import { getGenerationId } from './getGenerationId/getGenerationId.js';
import { getServiceFrontendSpec } from './getServiceFrontendSpec/getServiceFrontendSpec.js';
import { getServiceFrontendState } from './getServiceFrontendState/getServiceFrontendState.js';
import { managedRuntime } from './managedRuntime.js';
import { openGeneration } from './openGeneration/openGeneration.js';
import { prepareGeneration } from './prepareGeneration/prepareGeneration.js';
import { ServiceFrontendBlockRepo } from './ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.js';
import { getServiceRepo } from './ServiceRepo/getServiceRepo/getServiceRepo.js';
import { getSystemLogRepo } from './SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
import { SystemRepo } from './SystemRepo/SystemRepo.js';
import type {
  IAccountBlockOutboxRecord,
  IAuthorizedActorFrontend,
} from './types.js';

export { AccountBlockRepo } from './AccountBlockRepo/AccountBlockRepo.js';
export { AccountRepo } from './AccountRepo/AccountRepo.js';
export type { IAccountBlockOutboxRecord } from './types.js';
export { ActorRepo } from './ActorRepo/ActorRepo.js';
export { ActorBlockRepo } from './ActorBlockRepo/ActorBlockRepo.js';
export { FrontendRepo } from './FrontendRepo/FrontendRepo.js';
export { FrontendBlockRepo } from './FrontendBlockRepo/FrontendBlockRepo.js';
export { AuthorizationRepo } from './AuthorizationRepo/AuthorizationRepo.js';
export { SystemLogAgent } from './SystemLogAgent/SystemLogAgent.js';
export { SystemLogRepo } from './SystemLogRepo/SystemLogRepo.js';
export { ServiceRepo } from './ServiceRepo/ServiceRepo.js';
export { ServiceBlockRepo } from './ServiceBlockRepo/ServiceBlockRepo.js';
export { ServiceFrontendRepo } from './ServiceFrontendRepo/ServiceFrontendRepo.js';
export { ServiceFrontendBlockRepo } from './ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.js';
export { SystemRepo };

export class BackendRepo extends DurableObject {}
export class ControllerRepo extends DurableObject {}

const recordSystemWorkerLog = Effect.fn('SystemWorker.recordSystemWorkerLog')(
  function* (props: {
    deployId: string;
    generationId: string;
    level: ISystemLogLevel;
    message: string;
    payload?: unknown | null;
    source: string;
  }) {
    return yield* Effect.gen(function* () {
      const systemLogRepo = yield* getSystemLogRepo({
        key: { generationId: props.generationId },
      });
      const encoded = yield* makeAsync(() =>
        systemLogRepo.appendLogRow({
          deployId: props.deployId,
          level: props.level,
          message: props.message,
          payload: props.payload ?? null,
          source: props.source,
        }),
      );
      const row = yield* decodeRpc(
        encoded as Schema.EitherEncoded<ISystemLogRow, IAnyErrorJson>,
      );
      const systemLogAgent = env.SYSTEM_LOG_AGENT.getByName(props.generationId);
      yield* makeAsync(() => systemLogAgent.pushLogRows([row])).pipe(
        Effect.retry({ schedule: defaultRetrySchedule }),
      );
    }).pipe(Effect.catchAll(() => Effect.void));
  },
);

const finalizeAccountBlockHandler = makeRpcHandler(
  'SystemWorker.finalizeAccountBlock',
)(function* (props: {
  deployId: string;
  generationId: string;
  accountId: string;
  accountName: string;
  commands: readonly IAccountCommand[];
}) {
  return yield* Effect.gen(function* () {
    const { generationId, accountId, accountName, commands } = props;
    const systemRepo = SystemRepo.getRepo({ generationId });
    const reservationId = yield* makeAsync(() =>
      systemRepo.reserveGenerationWrite({
        deployId: props.deployId,
        operationName: 'finalizeAccountBlock',
      }),
    ).pipe(Effect.flatMap(decodeRpc));
    return yield* Effect.gen(function* () {
      const accountRepo = yield* getAccountRepo({
        key: {
          generationId,
          accountId,
          accountName,
        },
      });
      const tracedAccountRepo =
        makeTraceableRpcTarget<Pick<AccountRepo, 'finalizeAccountBlock'>>(
          accountRepo,
        );
      return yield* tracedAccountRepo
        .finalizeAccountBlock({ accountId, accountName, commands })
        .pipe(
          Effect.mapError(errorJson =>
            errorJson instanceof Error
              ? new ZerospinError({
                  code: 'account-repo-finalize-rpc-failed',
                  message: errorJson.message,
                  cause: ZerospinError.prettyUnknownFailure(errorJson),
                })
              : Schema.decodeUnknownSync(ZerospinError.schema)(errorJson),
          ),
        );
    }).pipe(
      Effect.ensuring(
        makeAsync(() =>
          systemRepo.releaseGenerationWrite({
            deployId: props.deployId,
            reservationId,
          }),
        ).pipe(
          Effect.flatMap(decodeRpc),
          Effect.retry({ schedule: defaultRetrySchedule }),
          Effect.catchAll(error => Effect.die(error)),
        ),
      ),
    );
  }).pipe(
    Effect.mapError(error =>
      Schema.encodeSync(ZerospinError.schema)(Cause.originalError(error)),
    ),
  );
});

export class SystemWorker extends WorkerEntrypoint {
  getGenerationId(): Promise<
    Schema.EitherEncoded<
      {
        deployId: string;
        generationId: string;
        workerVersionId: string;
      },
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getGenerationId().pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  drainGeneration(props: {
    deployId: string;
    generationId: string;
    mode: 'freeze' | 'complete';
    successorGenerationId: string | null;
  }): Promise<
    Schema.EitherEncoded<
      {
        deployId: string;
        generationId: string;
        admission: 'draining' | 'drained';
      },
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      drainGeneration(props).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  prepareGeneration(props: {
    deployId: string;
    generationId: string;
    prevGenerationId: string | null;
    systemSpec: ISystemSpec;
    seeds: readonly IDeploySeedCommand[];
  }): Promise<
    Schema.EitherEncoded<
      {
        deployId: string;
        generationId: string;
        readiness: 'ready';
        reusedGeneration: boolean;
      },
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      prepareGeneration(props).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  openGeneration(props: { deployId: string; generationId: string }): Promise<
    Schema.EitherEncoded<
      {
        deployId: string;
        generationId: string;
        workerVersionId: string;
      },
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      openGeneration(props).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  createFrontendWebSocketTicket(props: {
    deployId: string;
    generationId: string;
    accountId: IAccountId;
    accountName: string;
    actorId: IActorId;
    actorName: string;
    frontendName: string;
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        ticket: string;
        systemId: ISystemId;
        generationId: string;
        accountId: IAccountId;
        accountName: string;
        actorId: IActorId;
        actorName: string;
        frontendName: string;
        frontendVersion: string;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      createFrontendWebSocketTicket({
        ...props,
        configuredSystemId: env.ZEROSPIN_SYSTEM_ID,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  authenticateServiceFrontend(props: {
    deployId: string;
    generationId: string;
    serviceName: string;
    actorName: string;
    frontendName: string;
    signature: unknown;
  }): Promise<Schema.EitherEncoded<IActorId, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      authenticateServiceFrontend(props).pipe(
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }

  getServiceFrontendSpec(props: {
    deployId: string;
    generationId: string;
    serviceName: string;
    actorName: string;
    frontendName: string;
  }): Promise<
    Schema.EitherEncoded<
      ReturnType<typeof makeServiceFrontendControllerSpec>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      getServiceFrontendSpec(props).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getServiceFrontendState(props: {
    deployId: string;
    generationId: string;
    serviceName: string;
    actorName: string;
    actorId: IActorId;
    frontendName: string;
    systemWorkerName: string;
  }): Promise<Schema.EitherEncoded<IServiceFrontendState, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      getServiceFrontendState(props).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  createServiceFrontendWebSocketTicket(props: {
    deployId: string;
    generationId: string;
    serviceName: string;
    actorName: string;
    actorId: IActorId;
    frontendName: string;
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        ticket: string;
        systemId: ISystemId;
        generationId: string;
        serviceName: string;
        actorId: IActorId;
        actorName: string;
        frontendName: string;
        frontendVersion: string;
      }>,
      IAnyErrorJson
    >
  > {
    return managedRuntime.runPromise(
      createServiceFrontendWebSocketTicket({
        ...props,
        configuredSystemId: env.ZEROSPIN_SYSTEM_ID,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  appendTelemetryBatch(props: {
    batch: ITelemetryBatch;
    deployId: string;
    generationId: string;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          generationId: props.generationId,
        });
        const reservationId = yield* makeAsync(() =>
          systemRepo.reserveGenerationWrite({
            deployId: props.deployId,
            operationName: 'appendTelemetryBatch',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* Effect.gen(function* () {
          const systemLogRepo = yield* getSystemLogRepo({
            key: { generationId: props.generationId },
          });
          const encoded = yield* makeAsync(() =>
            systemLogRepo.appendTelemetryBatch({
              batch: props.batch,
              deployId: props.deployId,
            }),
          );
          return yield* decodeRpc(encoded);
        }).pipe(
          Effect.ensuring(
            makeAsync(() =>
              systemRepo.releaseGenerationWrite({
                deployId: props.deployId,
                reservationId,
              }),
            ).pipe(
              Effect.flatMap(decodeRpc),
              Effect.retry({ schedule: defaultRetrySchedule }),
              Effect.catchAll(error => Effect.die(error)),
            ),
          ),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getFrontendState(props: {
    deployId: string;
    generationId: string;
    accountId: string;
    accountName: string;
    actorId: IActorId;
    actorName: string;
    frontendName: string;
    systemWorkerName: string;
  }): Promise<Schema.EitherEncoded<IFrontendSyncState, IAnyErrorJson>> {
    const source = 'SystemWorker.getFrontendState';
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          generationId: props.generationId,
        });
        const generationState = yield* makeAsync(() =>
          systemRepo.getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        if (generationState === null) {
          return yield* new ZerospinError({
            code: 'frontend-authority-generation-missing',
            message:
              'The bound frontend generation has no authoritative lifecycle state',
            extra: { generationId: props.generationId },
          });
        }
        if (generationState.generationId !== props.generationId) {
          return yield* new ZerospinError({
            code: 'frontend-authority-generation-mismatch',
            message:
              'The bound frontend generation does not match its authoritative lifecycle state',
            extra: {
              generationId: props.generationId,
              storedGenerationId: generationState.generationId,
            },
          });
        }
        if (generationState.admission === 'drained') {
          if (generationState.successorGenerationId === null) {
            return yield* new ZerospinError({
              code: 'frontend-successor-generation-missing',
              message:
                'The drained frontend generation has no recorded successor',
              extra: { generationId: props.generationId },
            });
          }
          return yield* new ZerospinError({
            code: 'frontend-generation-changed',
            message:
              'The authoritative frontend belongs to a recorded successor generation',
            extra: {
              generationId: props.generationId,
              successorGenerationId: generationState.successorGenerationId,
              accountId: props.accountId,
              accountName: props.accountName,
              actorId: props.actorId,
              actorName: props.actorName,
              frontendName: props.frontendName,
            },
          });
        }
        if (generationState.activeSystemSpec === null) {
          return yield* new ZerospinError({
            code: 'frontend-authority-system-spec-missing',
            message:
              'The bound frontend generation has no active authoritative SystemSpec',
            extra: { generationId: props.generationId },
          });
        }
        const runtimeSystemSpec = makeSystemSpec({ system });
        const runtimeFrontendBinding =
          runtimeSystemSpec.accountControllers[props.accountName]
            ?.actorControllers[props.actorName]?.frontends[props.frontendName];
        const authoritativeFrontendBinding =
          generationState.activeSystemSpec.accountControllers[props.accountName]
            ?.actorControllers[props.actorName]?.frontends[props.frontendName];
        if (runtimeFrontendBinding === undefined) {
          return yield* new ZerospinError({
            code: 'frontend-identity-changed',
            message:
              'The bound SystemWorker no longer defines the authenticated frontend identity',
            extra: {
              generationId: props.generationId,
              accountName: props.accountName,
              actorName: props.actorName,
              frontendName: props.frontendName,
            },
          });
        }
        if (authoritativeFrontendBinding === undefined) {
          return yield* new ZerospinError({
            code: 'frontend-identity-changed',
            message:
              'The active SystemSpec no longer defines the authenticated frontend identity',
            extra: {
              generationId: props.generationId,
              accountName: props.accountName,
              actorName: props.actorName,
              frontendName: props.frontendName,
            },
          });
        }
        if (
          !isEqual(
            runtimeFrontendBinding.frontendController,
            authoritativeFrontendBinding.frontendController,
          )
        ) {
          return yield* new ZerospinError({
            code: 'frontend-version-changed',
            message:
              'The authoritative frontend version or specification has changed within this generation',
            extra: {
              generationId: props.generationId,
              accountId: props.accountId,
              accountName: props.accountName,
              actorId: props.actorId,
              actorName: props.actorName,
              frontendName: props.frontendName,
              frontendVersion:
                runtimeFrontendBinding.frontendController.version,
              authoritativeFrontendVersion:
                authoritativeFrontendBinding.frontendController.version,
            },
          });
        }
        yield* makeAsync(() =>
          systemRepo.assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* recordSystemWorkerLog({
          deployId: props.deployId,
          generationId: props.generationId,
          level: 'info',
          message: 'started',
          source,
        });
        const {
          generationId,
          accountId,
          accountName,
          actorId,
          actorName,
          frontendName,
          systemWorkerName,
        } = props;
        const decodedAccountId: IAccountId = yield* Schema.decodeUnknown(
          makeAbbreviationIdSchema(coreAbbreviations.account),
        )(accountId).pipe(
          mapParseError({
            code: 'frontend-state-account-id-invalid',
            prefix: 'Failed to decode frontend state accountId',
          }),
        );
        const lineageUnknown = yield* makeAsync(() =>
          systemRepo.resolveFrontendProjectionLineage({
            deployId: props.deployId,
            target: {
              kind: 'account',
              accountId: decodedAccountId,
              accountName,
              actorId,
              actorName,
              frontendName,
            },
          }),
        );
        const lineageEncoded = yield* Schema.decodeUnknown(
          Schema.Union(
            Schema.Struct({
              _tag: Schema.Literal('Right'),
              right: Schema.Struct({
                mode: Schema.Literal('live', 'no-local-segment'),
                predecessor: Schema.NullOr(
                  Schema.Struct({
                    generationId: Schema.String,
                    repoName: Schema.String,
                    terminalFrontendIndex: Schema.Number,
                  }),
                ),
              }),
            }),
            Schema.Struct({
              _tag: Schema.Literal('Left'),
              left: Schema.encodedSchema(ZerospinError.schema),
            }),
          ),
        )(lineageUnknown).pipe(
          mapParseError({
            code: 'frontend-lineage-rpc-invalid',
            prefix: 'Failed to decode SystemRepo frontend lineage RPC',
          }),
        );
        const lineage = yield* decodeRpc(lineageEncoded);

        const frontendRepo = yield* getFrontendRepo({
          key: {
            generationId,
            accountId: decodedAccountId,
            accountName,
            actorId,
            actorName,
            frontendName,
          },
        });
        const encodedUnknown = yield* makeAsync(() =>
          frontendRepo.getFrontendState({
            accountId: decodedAccountId,
            accountName,
            actorId,
            actorName,
            frontendName,
            systemWorkerName,
            lineage,
          }),
        );
        const encoded = yield* Schema.decodeUnknown(
          Schema.Union(
            Schema.Struct({
              _tag: Schema.Literal('Right'),
              right: Schema.typeSchema(FrontendSyncStateSchema),
            }),
            Schema.Struct({
              _tag: Schema.Literal('Left'),
              left: Schema.encodedSchema(ZerospinError.schema),
            }),
          ),
        )(encodedUnknown).pipe(
          mapParseError({
            code: 'frontend-state-rpc-invalid',
            prefix: 'Failed to decode FrontendRepo state RPC',
          }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(
        Effect.tap(() =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'info',
            message: 'succeeded',
            source,
          }),
        ),
        Effect.tapError(error =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'error',
            message: 'failed',
            payload: { message: error.message },
            source,
          }),
        ),
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }

  getAccountIds(props: {
    deployId: string;
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<Array<InferIdFromAbbreviation>, IAnyErrorJson>
  > {
    const source = 'SystemWorker.getAccountIds';
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* recordSystemWorkerLog({
          deployId: props.deployId,
          generationId: props.generationId,
          level: 'info',
          message: 'started',
          source,
        });
        return yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).getAccountIds(),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(
        Effect.tap(() =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'info',
            message: 'succeeded',
            source,
          }),
        ),
        Effect.tapError(error =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'error',
            message: 'failed',
            payload: { message: error.message },
            source,
          }),
        ),
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }

  getAuthorizedActorFrontends(props: {
    deployId: string;
    generationId: string;
    accountId: string;
    accountName: string;
  }): Promise<
    Schema.EitherEncoded<ReadonlyArray<IAuthorizedActorFrontend>, IAnyErrorJson>
  > {
    const source = 'SystemWorker.getAuthorizedActorFrontends';
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* recordSystemWorkerLog({
          deployId: props.deployId,
          generationId: props.generationId,
          level: 'info',
          message: 'started',
          source,
        });
        const { generationId, accountId, accountName } = props;
        const authorizationRepo = yield* getAuthorizationRepo({
          key: {
            generationId,
            accountId,
            accountName,
          },
        });
        const encoded = yield* makeAsync(() =>
          authorizationRepo.getAuthorizedActorFrontends({
            accountName,
          }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(
        Effect.tap(() =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'info',
            message: 'succeeded',
            source,
          }),
        ),
        Effect.tapError(error =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'error',
            message: 'failed',
            payload: { message: error.message },
            source,
          }),
        ),
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }

  getFrontendSpec(props: {
    accountName: string;
    actorName: string;
    deployId: string;
    frontendName: string;
    generationId: string;
  }): Promise<Schema.EitherEncoded<IFrontendControllerSpec, IAnyErrorJson>> {
    const source = 'SystemWorker.getFrontendSpec';
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* recordSystemWorkerLog({
          deployId: props.deployId,
          generationId: props.generationId,
          level: 'info',
          message: 'started',
          source,
        });
        const { accountName, actorName, frontendName } = props;
        const frontendController = yield* getFrontendController({
          system,
          accountName,
          actorName,
          frontendName,
        });

        return makeFrontendControllerSpec(frontendController);
      }).pipe(
        Effect.tap(() =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'info',
            message: 'succeeded',
            source,
          }),
        ),
        Effect.tapError(error =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'error',
            message: 'failed',
            payload: { message: error.message },
            source,
          }),
        ),
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }

  getSystemSpec(props: {
    deployId: string;
    generationId: string;
  }): Promise<Schema.EitherEncoded<ISystemSpec, IAnyErrorJson>> {
    const source = 'SystemWorker.getSystemSpec';
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* recordSystemWorkerLog({
          deployId: props.deployId,
          generationId: props.generationId,
          level: 'info',
          message: 'started',
          source,
        });
        return makeSystemSpec({ system });
      }).pipe(
        Effect.tap(() =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'info',
            message: 'succeeded',
            source,
          }),
        ),
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }

  getSystemRepos(props: {
    deployId: string;
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const encoded = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).getRepoRegistrations({ repoType: 'SystemRepo' }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getSystemRepoTableRows(props: {
    deployId: string;
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const { generationId, repoName, tableName } = props;
        const registrationsEncoded = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getRepoRegistrations({
            repoType: 'SystemRepo',
          }),
        );
        const registrations = yield* decodeRpc(registrationsEncoded);
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

        const repo = SystemRepo.getRepo({ generationId });
        const encoded = yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName }));
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAccountRepos(props: {
    deployId: string;
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const encoded = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).getRepoRegistrations({ repoType: 'AccountRepo' }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAccountRepoTableRows(props: {
    deployId: string;
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const { generationId, repoName, tableName } = props;
        const registrationsEncoded = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getRepoRegistrations({
            repoType: 'AccountRepo',
          }),
        );
        const registrations = yield* decodeRpc(registrationsEncoded);
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `AccountRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'AccountRepo' },
          });
        }

        const repo = env.ACCOUNT_REPO.getByName(repoName);
        const encoded = yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName }));
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAuthorizationRepos(props: {
    deployId: string;
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const encoded = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).getRepoRegistrations({ repoType: 'AuthorizationRepo' }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAuthorizationRepoTableRows(props: {
    deployId: string;
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const { generationId, repoName, tableName } = props;
        const registrationsEncoded = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getRepoRegistrations({
            repoType: 'AuthorizationRepo',
          }),
        );
        const registrations = yield* decodeRpc(registrationsEncoded);
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `AuthorizationRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'AuthorizationRepo' },
          });
        }

        const repo = env.AUTHORIZATION_REPO.getByName(repoName);
        const encoded = yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName }));
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getActorRepos(props: {
    deployId: string;
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const encoded = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).getRepoRegistrations({ repoType: 'ActorRepo' }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getActorRepoTableRows(props: {
    deployId: string;
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const { generationId, repoName, tableName } = props;
        const registrationsEncoded = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getRepoRegistrations({
            repoType: 'ActorRepo',
          }),
        );
        const registrations = yield* decodeRpc(registrationsEncoded);
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `ActorRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'ActorRepo' },
          });
        }

        const repo = env.ACTOR_REPO.getByName(repoName);
        const encoded = yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName }));
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getFrontendRepos(props: {
    deployId: string;
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const encoded = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).getRepoRegistrations({ repoType: 'FrontendRepo' }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getFrontendRepoTableRows(props: {
    deployId: string;
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const { generationId, repoName, tableName } = props;
        const registrationsEncoded = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getRepoRegistrations({
            repoType: 'FrontendRepo',
          }),
        );
        const registrations = yield* decodeRpc(registrationsEncoded);
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `FrontendRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'FrontendRepo' },
          });
        }

        const repo = env.FRONTEND_REPO.getByName(repoName);
        const encoded = yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName }));
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getServiceRepos(props: {
    deployId: string;
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const encoded = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).getRepoRegistrations({ repoType: 'ServiceRepo' }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getServiceRepoTableRows(props: {
    deployId: string;
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const { generationId, repoName, tableName } = props;
        const registrationsEncoded = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getRepoRegistrations({
            repoType: 'ServiceRepo',
          }),
        );
        const registrations = yield* decodeRpc(registrationsEncoded);
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
        const encoded = yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName }));
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAccountBlockRepos(props: {
    deployId: string;
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const encoded = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).getRepoRegistrations({ repoType: 'AccountBlockRepo' }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getAccountBlockRepoTableRows(props: {
    deployId: string;
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const { generationId, repoName, tableName } = props;
        const registrationsEncoded = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getRepoRegistrations({
            repoType: 'AccountBlockRepo',
          }),
        );
        const registrations = yield* decodeRpc(registrationsEncoded);
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `AccountBlockRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'AccountBlockRepo' },
          });
        }

        const repo = env.ACCOUNT_BLOCK_REPO.getByName(repoName);
        const encoded = yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName }));
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getActorBlockRepos(props: {
    deployId: string;
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const encoded = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).getRepoRegistrations({ repoType: 'ActorBlockRepo' }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getActorBlockRepoTableRows(props: {
    deployId: string;
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const { generationId, repoName, tableName } = props;
        const registrationsEncoded = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getRepoRegistrations({
            repoType: 'ActorBlockRepo',
          }),
        );
        const registrations = yield* decodeRpc(registrationsEncoded);
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `ActorBlockRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'ActorBlockRepo' },
          });
        }

        const repo = env.ACTOR_BLOCK_REPO.getByName(repoName);
        const encoded = yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName }));
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getFrontendBlockRepos(props: {
    deployId: string;
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const encoded = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).getRepoRegistrations({ repoType: 'FrontendBlockRepo' }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getFrontendBlockRepoTableRows(props: {
    deployId: string;
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const { generationId, repoName, tableName } = props;
        const registrationsEncoded = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getRepoRegistrations({
            repoType: 'FrontendBlockRepo',
          }),
        );
        const registrations = yield* decodeRpc(registrationsEncoded);
        if (
          registrations.find(
            registration => registration.repoName === repoName,
          ) === undefined
        ) {
          return yield* new ZerospinError({
            code: 'repo-explorer-repo-not-found',
            message: `FrontendBlockRepo "${repoName}" is not registered`,
            extra: { repoName, repoType: 'FrontendBlockRepo' },
          });
        }

        const repo = env.FRONTEND_BLOCK_REPO.getByName(repoName);
        const encoded = yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName }));
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getServiceBlockRepos(props: {
    deployId: string;
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const encoded = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).getRepoRegistrations({ repoType: 'ServiceBlockRepo' }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getServiceBlockRepoTableRows(props: {
    deployId: string;
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const { generationId, repoName, tableName } = props;
        const registrationsEncoded = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getRepoRegistrations({
            repoType: 'ServiceBlockRepo',
          }),
        );
        const registrations = yield* decodeRpc(registrationsEncoded);
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
        const encoded = yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName }));
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getSystemLogRepos(props: {
    deployId: string;
    generationId: string;
  }): Promise<
    Schema.EitherEncoded<readonly IRepoRegistration[], IAnyErrorJson>
  > {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const encoded = yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).getRepoRegistrations({ repoType: 'SystemLogRepo' }),
        );
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getSystemLogRepoTableRows(props: {
    deployId: string;
    generationId: string;
    repoName: string;
    tableName: string;
  }): Promise<Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const { generationId, repoName, tableName } = props;
        const registrationsEncoded = yield* makeAsync(() =>
          SystemRepo.getRepo({ generationId }).getRepoRegistrations({
            repoType: 'SystemLogRepo',
          }),
        );
        const registrations = yield* decodeRpc(registrationsEncoded);
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
        const encoded = yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() => repo.getRepoTableRows({ tableName }));
        return yield* decodeRpc(encoded);
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  getSystemLogRows(props: {
    deployId: string;
    generationId: string;
    limit: number;
  }): Promise<Schema.EitherEncoded<readonly ISystemLogRow[], IAnyErrorJson>> {
    const source = 'SystemWorker.getSystemLogRows';
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* recordSystemWorkerLog({
          deployId: props.deployId,
          generationId: props.generationId,
          level: 'info',
          message: 'started',
          source,
        });
        const systemLogRepo = yield* getSystemLogRepo({
          key: { generationId: props.generationId },
        });
        const encoded = yield* makeAsync(() =>
          systemLogRepo.getSystemLogRows({ limit: props.limit }),
        );
        return yield* decodeRpc(
          encoded as Schema.EitherEncoded<
            readonly ISystemLogRow[],
            IAnyErrorJson
          >,
        );
      }).pipe(
        Effect.tap(() =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'info',
            message: 'succeeded',
            source,
          }),
        ),
        Effect.tapError(error =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'error',
            message: 'failed',
            payload: { message: error.message },
            source,
          }),
        ),
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }

  authorize(props: {
    deployId: string;
    generationId: string;
    accountId: string;
    accountName: string;
    actorName: string;
    frontendName: string;
    actor: IActor;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    const source = 'SystemWorker.authorize';
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          generationId: props.generationId,
        });
        const reservationId = yield* makeAsync(() =>
          systemRepo.reserveGenerationWrite({
            deployId: props.deployId,
            operationName: 'authorize',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* Effect.gen(function* () {
          yield* recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'info',
            message: 'started',
            source,
          });
          const {
            generationId,
            accountId,
            accountName,
            actorName,
            frontendName,
            actor,
          } = props;

          const actorRepo = yield* getActorRepo({
            key: {
              generationId,
              accountId,
              accountName,
              actorId: actor.actorId,
              actorName,
            },
          });
          const actorRepoEncoded = yield* makeAsync<
            Schema.EitherEncoded<void, IAnyErrorJson>
          >(() =>
            actorRepo.authorize({
              actor,
              accountName,
              actorName,
              frontendName,
            }),
          );
          yield* decodeRpc(actorRepoEncoded);

          const authorizationRepo = yield* getAuthorizationRepo({
            key: {
              generationId,
              accountId,
              accountName,
            },
          });
          const authorizationRepoEncoded = yield* makeAsync<
            Schema.EitherEncoded<void, IAnyErrorJson>
          >(() =>
            authorizationRepo.authorize({
              actor,
              accountName,
              actorName,
              frontendName,
            }),
          );
          return yield* decodeRpc(authorizationRepoEncoded);
        }).pipe(
          Effect.tap(() =>
            recordSystemWorkerLog({
              deployId: props.deployId,
              generationId: props.generationId,
              level: 'info',
              message: 'succeeded',
              source,
            }),
          ),
          Effect.tapError(error =>
            recordSystemWorkerLog({
              deployId: props.deployId,
              generationId: props.generationId,
              level: 'error',
              message: 'failed',
              payload: { message: error.message },
              source,
            }),
          ),
          Effect.ensuring(
            makeAsync(() =>
              systemRepo.releaseGenerationWrite({
                deployId: props.deployId,
                reservationId,
              }),
            ).pipe(
              Effect.flatMap(decodeRpc),
              Effect.retry({ schedule: defaultRetrySchedule }),
              Effect.catchAll(error => Effect.die(error)),
            ),
          ),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  /**
   * Verifies the session signature via `AccountRepo.authenticate`.
   *
   * `Apis.getFrontendApi` → here → `AccountRepo.authenticate`.
   */
  authenticate(props: {
    deployId: string;
    generationId: string;
    accountId: string;
    accountName: string;
    actorName: string;
    frontendName: string;
    signature: unknown;
  }): Promise<Schema.EitherEncoded<IActor, IAnyErrorJson>> {
    const source = 'SystemWorker.authenticate';
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          generationId: props.generationId,
        });
        const reservationId = yield* makeAsync(() =>
          systemRepo.reserveGenerationWrite({
            deployId: props.deployId,
            operationName: 'authenticate',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* Effect.gen(function* () {
          yield* recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'info',
            message: 'started',
            source,
          });
          const {
            generationId,
            accountId,
            accountName,
            actorName,
            frontendName,
            signature,
          } = props;

          const accountRepo = yield* getAccountRepo({
            key: {
              generationId,
              accountId,
              accountName,
            },
          });
          const encoded = yield* makeAsync(() =>
            accountRepo.authenticate({
              accountName,
              actorName,
              frontendName,
              signature,
            }),
          );
          return yield* decodeRpc(encoded);
        }).pipe(
          Effect.tap(() =>
            recordSystemWorkerLog({
              deployId: props.deployId,
              generationId: props.generationId,
              level: 'info',
              message: 'succeeded',
              source,
            }),
          ),
          Effect.tapError(error =>
            recordSystemWorkerLog({
              deployId: props.deployId,
              generationId: props.generationId,
              level: 'error',
              message: 'failed',
              payload: { message: error.message },
              source,
            }),
          ),
          Effect.ensuring(
            makeAsync(() =>
              systemRepo.releaseGenerationWrite({
                deployId: props.deployId,
                reservationId,
              }),
            ).pipe(
              Effect.flatMap(decodeRpc),
              Effect.retry({ schedule: defaultRetrySchedule }),
              Effect.catchAll(error => Effect.die(error)),
            ),
          ),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  pushCommands(props: {
    deployId: string;
    generationId: string;
    accountId: string;
    accountName: string;
    actorId: string;
    actorName: string;
    frontendName: string;
    commands: readonly IEncodedCommand<IStagedCommand>[];
  }): Promise<
    Schema.EitherEncoded<
      {
        pendingCommands: readonly IEncodedCommand<IPushedCommand>[];
        pushedCommands: readonly IEncodedCommand<IPushedCommand>[];
        failedCommands: readonly IEncodedCommand<IFailedStagedCommand>[];
      },
      IAnyErrorJson
    >
  > {
    const source = 'SystemWorker.pushCommands';
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          generationId: props.generationId,
        });
        const generationState = yield* makeAsync(() =>
          systemRepo.getGenerationState(),
        ).pipe(Effect.flatMap(decodeRpc));
        if (generationState === null) {
          return yield* new ZerospinError({
            code: 'frontend-authority-generation-missing',
            message:
              'The bound frontend generation has no authoritative lifecycle state',
            extra: { generationId: props.generationId },
          });
        }
        if (generationState.generationId !== props.generationId) {
          return yield* new ZerospinError({
            code: 'frontend-authority-generation-mismatch',
            message:
              'The bound frontend generation does not match its authoritative lifecycle state',
            extra: {
              generationId: props.generationId,
              storedGenerationId: generationState.generationId,
            },
          });
        }
        if (generationState.admission === 'drained') {
          if (generationState.successorGenerationId === null) {
            return yield* new ZerospinError({
              code: 'frontend-successor-generation-missing',
              message:
                'The drained frontend generation has no recorded successor',
              extra: { generationId: props.generationId },
            });
          }
          return yield* new ZerospinError({
            code: 'frontend-generation-changed',
            message:
              'The authoritative frontend belongs to a recorded successor generation',
            extra: {
              generationId: props.generationId,
              successorGenerationId: generationState.successorGenerationId,
              accountId: props.accountId,
              accountName: props.accountName,
              actorId: props.actorId,
              actorName: props.actorName,
              frontendName: props.frontendName,
            },
          });
        }
        if (generationState.activeSystemSpec === null) {
          return yield* new ZerospinError({
            code: 'frontend-authority-system-spec-missing',
            message:
              'The bound frontend generation has no active authoritative SystemSpec',
            extra: { generationId: props.generationId },
          });
        }
        const runtimeSystemSpec = makeSystemSpec({ system });
        const runtimeFrontendBinding =
          runtimeSystemSpec.accountControllers[props.accountName]
            ?.actorControllers[props.actorName]?.frontends[props.frontendName];
        const authoritativeFrontendBinding =
          generationState.activeSystemSpec.accountControllers[props.accountName]
            ?.actorControllers[props.actorName]?.frontends[props.frontendName];
        if (runtimeFrontendBinding === undefined) {
          return yield* new ZerospinError({
            code: 'frontend-identity-changed',
            message:
              'The bound SystemWorker no longer defines the authenticated frontend identity',
            extra: {
              generationId: props.generationId,
              accountName: props.accountName,
              actorName: props.actorName,
              frontendName: props.frontendName,
            },
          });
        }
        if (authoritativeFrontendBinding === undefined) {
          return yield* new ZerospinError({
            code: 'frontend-identity-changed',
            message:
              'The active SystemSpec no longer defines the authenticated frontend identity',
            extra: {
              generationId: props.generationId,
              accountName: props.accountName,
              actorName: props.actorName,
              frontendName: props.frontendName,
            },
          });
        }
        if (
          !isEqual(
            runtimeFrontendBinding.frontendController,
            authoritativeFrontendBinding.frontendController,
          )
        ) {
          return yield* new ZerospinError({
            code: 'frontend-version-changed',
            message:
              'The authoritative frontend version or specification has changed within this generation',
            extra: {
              generationId: props.generationId,
              accountId: props.accountId,
              accountName: props.accountName,
              actorId: props.actorId,
              actorName: props.actorName,
              frontendName: props.frontendName,
              frontendVersion:
                runtimeFrontendBinding.frontendController.version,
              authoritativeFrontendVersion:
                authoritativeFrontendBinding.frontendController.version,
            },
          });
        }
        const reservationId = yield* makeAsync(() =>
          systemRepo.reserveGenerationWrite({
            deployId: props.deployId,
            operationName: 'pushCommands',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* Effect.gen(function* () {
          yield* recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'info',
            message: 'started',
            source,
          });
          const frontendRepo = yield* getFrontendRepo({
            key: {
              generationId: props.generationId,
              accountId: props.accountId,
              accountName: props.accountName,
              actorId: props.actorId,
              actorName: props.actorName,
              frontendName: props.frontendName,
            },
          });
          return yield* makeAsync(() => frontendRepo.pushCommands(props)).pipe(
            Effect.flatMap(decodeRpc),
          );
        }).pipe(
          Effect.tap(() =>
            recordSystemWorkerLog({
              deployId: props.deployId,
              generationId: props.generationId,
              level: 'info',
              message: 'succeeded',
              source,
            }),
          ),
          Effect.tapError(error =>
            recordSystemWorkerLog({
              deployId: props.deployId,
              generationId: props.generationId,
              level: 'error',
              message: 'failed',
              payload: { message: error.message },
              source,
            }),
          ),
          Effect.ensuring(
            makeAsync(() =>
              systemRepo.releaseGenerationWrite({
                deployId: props.deployId,
                reservationId,
              }),
            ).pipe(
              Effect.flatMap(decodeRpc),
              Effect.retry({ schedule: defaultRetrySchedule }),
              Effect.catchAll(error => Effect.die(error)),
            ),
          ),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  /**
   * Finalizes account-controller commands into a persisted account block.
   *
   * `SystemApi.finalizeAccountCommands` → here → `AccountRepo.finalizeAccountBlock`.
   */
  finalizeAccountBlock(
    request: IRpcRequest<
      [
        {
          deployId: string;
          generationId: string;
          accountId: string;
          accountName: string;
          commands: readonly IAccountCommand[];
        },
      ]
    >,
  ): Promise<IRpcEnvelope<IAccountBlockOutboxRecord, IAnyErrorJson>> {
    return managedRuntime.runPromise(finalizeAccountBlockHandler(request));
  }

  /**
   * Finalizes service commands into service-owned storage.
   *
   * `SystemApi.finalizeServiceCommands` → here → `ServiceRepo.finalizeServiceCommands`.
   */
  finalizeServiceCommands(props: {
    deployId: string;
    generationId: string;
    serviceName: string;
    commands: readonly IServiceCommand[];
  }): Promise<
    Schema.EitherEncoded<
      Readonly<{
        executedCommands: readonly IExecutedServiceCommand[];
        failedCommands: readonly IFailedServiceCommand[];
      }>,
      IAnyErrorJson
    >
  > {
    const source = 'SystemWorker.finalizeServiceCommands';
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        const systemRepo = SystemRepo.getRepo({
          generationId: props.generationId,
        });
        const reservationId = yield* makeAsync(() =>
          systemRepo.reserveGenerationWrite({
            deployId: props.deployId,
            operationName: 'finalizeServiceCommands',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* Effect.gen(function* () {
          yield* recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'info',
            message: 'started',
            payload: {
              commandCount: props.commands.length,
              serviceName: props.serviceName,
            },
            source,
          });
          const serviceRepo = yield* getServiceRepo({
            key: {
              generationId: props.generationId,
              serviceName: props.serviceName,
            },
          });
          const encoded = yield* makeAsync<
            Schema.EitherEncoded<
              Readonly<{
                executedCommands: readonly IExecutedServiceCommand[];
                failedCommands: readonly IFailedServiceCommand[];
              }>,
              IAnyErrorJson
            >
          >(() => serviceRepo.finalizeServiceCommands(props));

          return yield* decodeRpc(encoded);
        }).pipe(
          Effect.tap(() =>
            recordSystemWorkerLog({
              deployId: props.deployId,
              generationId: props.generationId,
              level: 'info',
              message: 'succeeded',
              payload: {
                commandCount: props.commands.length,
                serviceName: props.serviceName,
              },
              source,
            }),
          ),
          Effect.tapError(error =>
            recordSystemWorkerLog({
              deployId: props.deployId,
              generationId: props.generationId,
              level: 'error',
              message: 'failed',
              payload: {
                commandCount: props.commands.length,
                message: error.message,
                serviceName: props.serviceName,
              },
              source,
            }),
          ),
          Effect.ensuring(
            makeAsync(() =>
              systemRepo.releaseGenerationWrite({
                deployId: props.deployId,
                reservationId,
              }),
            ).pipe(
              Effect.flatMap(decodeRpc),
              Effect.retry({ schedule: defaultRetrySchedule }),
              Effect.catchAll(error => Effect.die(error)),
            ),
          ),
        );
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  executeServiceQuery(props: {
    deployId: string;
    generationId: string;
    serviceName: string;
    queryName: string;
    params: unknown;
  }): Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>> {
    const source = 'SystemWorker.executeServiceQuery';
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* recordSystemWorkerLog({
          deployId: props.deployId,
          generationId: props.generationId,
          level: 'info',
          message: 'started',
          payload: {
            queryName: props.queryName,
            serviceName: props.serviceName,
          },
          source,
        });
        const serviceRepo = yield* getServiceRepo({
          key: {
            generationId: props.generationId,
            serviceName: props.serviceName,
          },
        });
        const encoded = yield* makeAsync(() =>
          serviceRepo.executeServiceQuery(props),
        );

        return yield* decodeRpc(
          encoded as Schema.EitherEncoded<unknown, IAnyErrorJson>,
        );
      }).pipe(
        Effect.tap(() =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'info',
            message: 'succeeded',
            payload: {
              queryName: props.queryName,
              serviceName: props.serviceName,
            },
            source,
          }),
        ),
        Effect.tapError(error =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'error',
            message: 'failed',
            payload: {
              message: error.message,
              queryName: props.queryName,
              serviceName: props.serviceName,
            },
            source,
          }),
        ),
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }

  executeActorQuery(props: {
    deployId: string;
    generationId: string;
    accountName: string;
    actorId: string;
    actorName: string;
    params: unknown;
    queryName: string;
    frontendName: string;
  }): Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>> {
    const source = 'SystemWorker.executeActorQuery';
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* recordSystemWorkerLog({
          deployId: props.deployId,
          generationId: props.generationId,
          level: 'info',
          message: 'started',
          source,
        });
        const { accountName, actorName, queryName } = props;
        const accountController = yield* getByKeyOrThrow({
          record: system.accountControllers,
          key: accountName,
          recordKind: 'accountControllers',
        });
        const actorController = yield* getByKeyOrThrow({
          record: accountController.actorControllers,
          key: actorName,
          recordKind: 'actorControllers',
        });

        if (Object.keys(actorController.api).length === 0) {
          return yield* new ZerospinError({
            code: 'actor-api-not-configured',
            message: `Actor ${accountName}.${actorName} does not configure an actor API`,
            extra: { accountName, actorName, queryName },
          });
        }

        const actorApi: IAnyActorApi = actorController.api;
        const serviceQuery = yield* getByKeyOrThrow({
          record: actorApi,
          key: queryName,
          recordKind: 'actor-query',
        });
        const serviceRepo = yield* getServiceRepo({
          key: {
            generationId: props.generationId,
            serviceName: serviceQuery.serviceName,
          },
        });
        const encoded = yield* makeAsync(() =>
          serviceRepo.executeActorQuery(props),
        );

        return yield* decodeRpc(
          encoded as Schema.EitherEncoded<unknown, IAnyErrorJson>,
        );
      }).pipe(
        Effect.tap(() =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'info',
            message: 'succeeded',
            source,
          }),
        ),
        Effect.tapError(error =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'error',
            message: 'failed',
            payload: { message: error.message },
            source,
          }),
        ),
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }

  executeSelectQuery(props: {
    deployId: string;
    generationId: string;
    accountId: string;
    accountName: string;
    query: IEncodedQuery;
  }): Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>> {
    const source = 'SystemWorker.executeSelectQuery';
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* recordSystemWorkerLog({
          deployId: props.deployId,
          generationId: props.generationId,
          level: 'info',
          message: 'started',
          source,
        });
        const accountRepo = yield* getAccountRepo({
          key: {
            generationId: props.generationId,
            accountId: props.accountId,
            accountName: props.accountName,
          },
        });
        const encoded = yield* makeAsync(() =>
          accountRepo.executeSelectQuery(props),
        );
        return yield* decodeRpc(
          encoded as Schema.EitherEncoded<unknown, IAnyErrorJson>,
        );
      }).pipe(
        Effect.tap(() =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'info',
            message: 'succeeded',
            source,
          }),
        ),
        Effect.tapError(error =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'error',
            message: 'failed',
            payload: { message: error.message },
            source,
          }),
        ),
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }

  async hello(props: {
    deployId: string;
    generationId: string;
  }): Promise<Schema.EitherEncoded<string, IAnyErrorJson>> {
    const source = 'SystemWorker.hello';
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        yield* makeAsync(() =>
          SystemRepo.getRepo({
            generationId: props.generationId,
          }).assertGenerationAdmission({
            deployId: props.deployId,
            mode: 'read',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* recordSystemWorkerLog({
          deployId: props.deployId,
          generationId: props.generationId,
          level: 'info',
          message: 'started',
          source,
        });
        return 'Hello from SystemWorker';
      }).pipe(
        Effect.tap(() =>
          recordSystemWorkerLog({
            deployId: props.deployId,
            generationId: props.generationId,
            level: 'info',
            message: 'succeeded',
            source,
          }),
        ),
        Effect.provide(AsyncLive),
        encodeRpc,
      ),
    );
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/ws-system-logs/')) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return Response.json(
          { message: 'Expected WebSocket upgrade' },
          { status: 426 },
        );
      }

      const encodedGenerationId = decodeURIComponent(
        url.pathname.slice('/ws-system-logs/'.length),
      );
      const generationId = encodedGenerationId.startsWith('/')
        ? encodedGenerationId.slice(1)
        : encodedGenerationId;
      // Hosted Workers are pinned to one generation at upload. A self-hosted
      // Worker routes the generation selected by its durable controller.
      if (
        env.ZEROSPIN_SELF_HOSTED !== 'true' &&
        generationId !== env.ZEROSPIN_GENERATION_ID
      ) {
        return Response.json(
          { message: 'WebSocket log generation does not match deployment' },
          { status: 403 },
        );
      }
      return env.SYSTEM_LOG_AGENT.getByName(generationId).fetch(request);
    }

    if (url.pathname === '/ws-frontend-blocks') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return Response.json(
          { message: 'Expected WebSocket upgrade' },
          { status: 426 },
        );
      }

      const publishableKeys = url.searchParams.getAll('publishableKey');
      const tickets = url.searchParams.getAll('ticket');
      const publishableKey = publishableKeys[0];
      const ticket = tickets[0];
      const ticketParts = ticket?.split('.');
      const decodedGenerationId = Schema.decodeUnknownEither(
        makeAbbreviationIdSchema(coreAbbreviations.generation),
      )(ticketParts?.[0]);
      if (
        publishableKeys.length !== 1 ||
        publishableKey === undefined ||
        publishableKey.length === 0 ||
        tickets.length !== 1 ||
        ticket === undefined ||
        ticketParts?.length !== 2 ||
        ticketParts[1] === undefined ||
        !/^[A-Za-z0-9_-]{43}$/.test(ticketParts[1]) ||
        Either.isLeft(decodedGenerationId)
      ) {
        return Response.json(
          { message: 'Missing or invalid WebSocket parameters' },
          { status: 400 },
        );
      }

      const generationId = decodedGenerationId.right;
      if (
        env.ZEROSPIN_SELF_HOSTED !== 'true' &&
        generationId !== env.ZEROSPIN_GENERATION_ID
      ) {
        return Response.json(
          { message: 'WebSocket ticket is invalid or expired' },
          { status: 401 },
        );
      }

      const settled = await managedRuntime.runPromise(
        makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).consumeFrontendWebSocketTicket({
            ticket,
          }),
        ).pipe(
          Effect.flatMap(decodeRpc),
          Effect.either,
          Effect.provide(AsyncLive),
        ),
      );
      if (settled._tag === 'Left') {
        if (
          settled.left.code === 'frontend-websocket-ticket-invalid' ||
          settled.left.code.startsWith('generation-')
        ) {
          return Response.json(
            { message: 'WebSocket ticket is invalid or expired' },
            { status: 401 },
          );
        }
        return Response.json(
          { message: 'Failed to admit WebSocket connection' },
          { status: 500 },
        );
      }

      // The ticket is already spent. A forwarding failure must not make the
      // same capability reusable, so the browser has to authenticate again.
      return managedRuntime.runPromise(
        makeAsync(() => {
          const frontendBlockRepo = env.FRONTEND_BLOCK_REPO.getByName(
            settled.right.repoName,
          ) as DurableObjectStub<Rpc.DurableObjectBranded> & {
            fetch(request: Request): Promise<Response>;
          };
          const forwardedHeaders = new Headers(request.headers);
          forwardedHeaders.set(
            'x-zerospin-frontend-version',
            settled.right.frontendVersion,
          );
          return frontendBlockRepo.fetch(
            new Request(request, { headers: forwardedHeaders }),
          );
        }).pipe(
          Effect.provide(AsyncLive),
          Effect.catchAll(() =>
            Effect.succeed(
              Response.json(
                { message: 'Failed to forward WebSocket connection' },
                { status: 500 },
              ),
            ),
          ),
        ),
      );
    }

    if (url.pathname === '/ws-service-frontend-blocks') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return Response.json(
          { message: 'Expected WebSocket upgrade' },
          { status: 426 },
        );
      }

      const publishableKeys = url.searchParams.getAll('publishableKey');
      const tickets = url.searchParams.getAll('ticket');
      const publishableKey = publishableKeys[0];
      const ticket = tickets[0];
      const ticketParts = ticket?.split('.');
      const decodedGenerationId = Schema.decodeUnknownEither(
        makeAbbreviationIdSchema(coreAbbreviations.generation),
      )(ticketParts?.[0]);
      if (
        publishableKeys.length !== 1 ||
        publishableKey === undefined ||
        publishableKey.length === 0 ||
        tickets.length !== 1 ||
        ticket === undefined ||
        ticketParts?.length !== 2 ||
        ticketParts[1] === undefined ||
        !/^[A-Za-z0-9_-]{43}$/.test(ticketParts[1]) ||
        Either.isLeft(decodedGenerationId)
      ) {
        return Response.json(
          { message: 'Missing or invalid WebSocket parameters' },
          { status: 400 },
        );
      }

      const generationId = decodedGenerationId.right;
      if (
        env.ZEROSPIN_SELF_HOSTED !== 'true' &&
        generationId !== env.ZEROSPIN_GENERATION_ID
      ) {
        return Response.json(
          { message: 'WebSocket ticket is invalid or expired' },
          { status: 401 },
        );
      }

      const settled = await managedRuntime.runPromise(
        makeAsync(() =>
          SystemRepo.getRepo({
            generationId,
          }).consumeServiceFrontendWebSocketTicket({ ticket }),
        ).pipe(
          Effect.flatMap(decodeRpc),
          Effect.either,
          Effect.provide(AsyncLive),
        ),
      );
      if (Either.isLeft(settled)) {
        if (
          settled.left.code === 'service-frontend-websocket-ticket-invalid' ||
          settled.left.code.startsWith('generation-')
        ) {
          return Response.json(
            { message: 'WebSocket ticket is invalid or expired' },
            { status: 401 },
          );
        }
        return Response.json(
          { message: 'Failed to admit WebSocket connection' },
          { status: 500 },
        );
      }

      // The spent ticket resolves only the server-persisted target. Rebuild the
      // deterministic room name here; no request parameter selects a repo.
      const repoNameSettled = await managedRuntime.runPromise(
        ServiceFrontendBlockRepo.repoUtils.nameUtils
          .makeName({
            generationId,
            serviceName: settled.right.serviceName,
            actorName: settled.right.actorName,
            actorId: settled.right.actorId,
            frontendName: settled.right.frontendName,
          })
          .pipe(Effect.either),
      );
      if (Either.isLeft(repoNameSettled)) {
        return Response.json(
          { message: 'Failed to forward WebSocket connection' },
          { status: 500 },
        );
      }

      return managedRuntime.runPromise(
        makeAsync(async () => {
          const forwardedHeaders = new Headers(request.headers);
          forwardedHeaders.set(
            'x-zerospin-frontend-version',
            settled.right.frontendVersion,
          );
          const response = await env.SERVICE_FRONTEND_BLOCK_REPO.getByName(
            repoNameSettled.right,
          ).fetch(new Request(request, { headers: forwardedHeaders }));
          if (!(response instanceof Response)) {
            throw new Error(
              'ServiceFrontendBlockRepo returned a non-Response fetch result',
            );
          }
          return response;
        }).pipe(
          Effect.provide(AsyncLive),
          Effect.catchAll(() =>
            Effect.succeed(
              Response.json(
                { message: 'Failed to forward WebSocket connection' },
                { status: 500 },
              ),
            ),
          ),
        ),
      );
    }

    return Response.json({ message: 'Not found' }, { status: 404 });
  }
}

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint
export default SystemWorker;
