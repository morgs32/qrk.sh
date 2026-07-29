import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable } from '@zerospin/core/models/makeTable';
import { makeEffectSchema } from '@zerospin/core/models/primitiveMaps';
import { primitives } from '@zerospin/core/models/primitives';
import { checkSystemCompatibility } from '@zerospin/core/system/checkSystemCompatibility';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { dutils } from '@zerospin/core/utils/dutils';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { ZerospinError } from '@zerospin/error';
import { newWorkersRpcResponse } from 'capnweb';
import type { env as cloudflareEnv } from 'cloudflare:workers';
import { eq, sql } from 'drizzle-orm';
import { Cause, Effect, Either, Layer, ManagedRuntime, Schema } from 'effect';
import { seeds } from 'seeds';
import { system } from 'system';
import { makeRepo } from 'system-worker/makeRepo/makeRepo';
import { makeRepoUtils } from 'system-worker/makeRepo/makeRepoUtils';

import { ApiKeyIdentityResolver } from '../ApiKeyIdentityResolver/ApiKeyIdentityResolver';
import { makeStaticApiKeyIdentityResolver } from '../ApiKeyIdentityResolver/makeStaticApiKeyIdentityResolver';
import type { ISystemProductionKeyJwtClaims } from '../CloudApiKeyJwtClaimsSchema';
import {
  makeDispatchRuntime,
  type IDispatchRuntime,
} from '../makeDispatchRuntime';
import { makeSystemWorkerName } from '../makeSystemWorkerName';
import { SystemWorkerResolver } from '../SystemWorkerResolver/SystemWorkerResolver';
import { WorkerExportsSystemWorkerResolver } from '../SystemWorkerResolver/WorkerExportsSystemWorkerResolver';
import { ZerospinApis } from '../ZerospinApis/ZerospinApis';

const generationTable = makeTable({
  name: 'generation',
  shape: {
    id: primitives.primaryKey({
      abbreviation: coreAbbreviations.generation,
    }),
    prevGenerationId: primitives.self({
      relation: 'previousGeneration',
      inverse: 'nextGenerations',
      nullable: true,
    }),
  },
});

const deployTable = makeTable({
  name: 'deploy',
  shape: {
    id: primitives.primaryKey({
      abbreviation: coreAbbreviations.deploy,
    }),
    systemWorkerName: primitives.text(),
    deployIndex: primitives.integer(),
    prevDeployId: primitives.self({
      relation: 'previousDeploy',
      inverse: 'nextDeploys',
      nullable: true,
    }),
    generationId: primitives.ref({
      table: generationTable,
      relation: 'generation',
      inverse: 'deploys',
    }),
    workerVersionId: primitives.text({ nullable: true, unique: true }),
    cloudflareDeploymentId: primitives.text({ nullable: true }),
    systemSpec: primitives.json({ schema: SystemSpecSchema }),
    status: primitives.enum({
      values: ['running', 'succeeded', 'failed'],
    }),
    phase: primitives.enum({
      values: [
        'checking',
        'draining',
        'uploading',
        'preparing',
        'activating',
        'complete',
      ],
    }),
    startedAt: primitives.date(),
    completedAt: primitives.date({ nullable: true }),
    failure: primitives.json({
      schema: Schema.encodedSchema(ZerospinError.schema),
      nullable: true,
    }),
  },
  indexes: [
    {
      name: 'deploy_systemWorkerName_deployIndex_idx',
      columns: ['systemWorkerName', 'deployIndex'],
      unique: true,
    },
  ],
});

const systemInstanceTable = makeTable({
  name: 'systemInstance',
  shape: {
    systemWorkerName: primitives.primaryKey({
      abbreviation: coreAbbreviations.system,
    }),
    systemId: primitives.opaqueId({
      abbreviation: coreAbbreviations.system,
    }),
    instanceId: primitives.text(),
    activeDeployId: primitives.ref({
      table: deployTable,
      relation: 'activeDeploy',
      inverse: 'activeSystemInstances',
      nullable: true,
    }),
    activatingDeployId: primitives.ref({
      table: deployTable,
      relation: 'activatingDeploy',
      inverse: 'activatingSystemInstances',
      nullable: true,
    }),
    transitionSourceDeployId: primitives.ref({
      table: deployTable,
      relation: 'transitionSourceDeploy',
      inverse: 'transitionSourceSystemInstances',
      nullable: true,
    }),
  },
});

const cleanRequestTable = makeTable({
  name: 'cleanRequest',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'cln' }),
    deployId: primitives.ref({
      table: deployTable,
      relation: 'deploy',
      inverse: 'cleanRequests',
    }),
    generationId: primitives.ref({
      table: generationTable,
      relation: 'generation',
      inverse: 'cleanRequests',
    }),
    consumedAt: primitives.date(),
  },
});

const deployLogTable = makeTable({
  name: 'deployLog',
  shape: {
    eventIndex: primitives.integer(),
    systemWorkerName: primitives.text(),
    deployId: primitives.ref({
      table: deployTable,
      relation: 'deploy',
      inverse: 'deployLogs',
    }),
    generationId: primitives.ref({
      table: generationTable,
      relation: 'generation',
      inverse: 'deployLogs',
    }),
    phase: primitives.enum({
      values: [
        'checking',
        'draining',
        'uploading',
        'preparing',
        'activating',
        'complete',
      ],
    }),
    level: primitives.enum({
      values: ['debug', 'info', 'warn', 'error'],
    }),
    message: primitives.text(),
    payload: primitives.json({
      schema: Schema.Unknown,
      nullable: true,
    }),
    createdAt: primitives.date(),
  },
  indexes: [
    {
      name: 'deployLog_eventIndex_idx',
      columns: ['eventIndex'],
      unique: true,
    },
  ],
});

const selfHostedZerospinApisRepoTables = {
  systemInstance: systemInstanceTable,
  generation: generationTable,
  deploy: deployTable,
  cleanRequest: cleanRequestTable,
  deployLog: deployLogTable,
};

const selfHostedZerospinApisDbConfig = makeDbConfig({
  tables: selfHostedZerospinApisRepoTables,
});
const systemInstanceRowSchema = makeEffectSchema(
  selfHostedZerospinApisRepoTables.systemInstance.shape,
);
const generationRowSchema = makeEffectSchema(
  selfHostedZerospinApisRepoTables.generation.shape,
);
const deployRowSchema = makeEffectSchema(
  selfHostedZerospinApisRepoTables.deploy.shape,
);
const cleanRequestRowSchema = makeEffectSchema(
  selfHostedZerospinApisRepoTables.cleanRequest.shape,
);
const deployLogRowSchema = makeEffectSchema(
  selfHostedZerospinApisRepoTables.deployLog.shape,
);

const selfHostedZerospinApisRepoUtils = makeRepoUtils({
  abbreviation: undefined,
  namePattern: RoutePattern.parse('/:systemWorkerName'),
  managedRuntime: ManagedRuntime.make(AsyncLive),
  getDbConfig: Effect.fn('SelfHostedZerospinApis.getDbConfig')(function* () {
    yield* Effect.void;
    return selfHostedZerospinApisDbConfig;
  }),
});

const SelfHostedZerospinApisRepo = makeRepo({
  repoUtils: selfHostedZerospinApisRepoUtils,
});

/**
 * Stable self-hosted deployment control and Cap'n Web readiness boundary.
 *
 * The Durable Object name is the stable `{systemId}:{instanceId}` identity,
 * where `instanceId` is exactly `local` or `production`. Wrangler supplies that
 * identity, one optional local clean request, and Version Metadata. This object
 * allocates deploy/generation identities, persists every state transition, and
 * passes the selected identities explicitly to SystemWorker lifecycle RPCs and
 * the final ZerospinApis capability.
 */
export class SelfHostedZerospinApis extends SelfHostedZerospinApisRepo {
  readonly #apisReadiness: Promise<ZerospinApis>;
  readonly #runtime: IDispatchRuntime;

  constructor(
    ctx: ConstructorParameters<typeof SelfHostedZerospinApisRepo>[0],
    workerEnv: typeof cloudflareEnv,
  ) {
    super(ctx, workerEnv);

    if (workerEnv.ZEROSPIN_SELF_HOSTED !== 'true') {
      throw new Error(
        'SelfHostedZerospinApis requires ZEROSPIN_SELF_HOSTED to be exactly true',
      );
    }
    if (
      workerEnv.ZEROSPIN_INSTANCE_ID !== 'local' &&
      workerEnv.ZEROSPIN_INSTANCE_ID !== 'production'
    ) {
      throw new Error(
        'SelfHostedZerospinApis requires ZEROSPIN_INSTANCE_ID to be exactly local or production',
      );
    }
    const instanceId = workerEnv.ZEROSPIN_INSTANCE_ID;
    const systemWorkerName = Schema.decodeUnknownSync(
      makeEffectSchema({
        systemWorkerName:
          selfHostedZerospinApisRepoTables.systemInstance.shape
            .systemWorkerName,
      }),
    )({
      systemWorkerName: makeSystemWorkerName({
        systemId: workerEnv.ZEROSPIN_SYSTEM_ID,
        instanceId,
      }),
    }).systemWorkerName;
    if (this.key.systemWorkerName !== systemWorkerName) {
      throw new Error(
        'SelfHostedZerospinApis must be addressed by the exact {systemId}:{instanceId} instance name',
      );
    }

    if (
      instanceId === 'production' &&
      (workerEnv.ZEROSPIN_SECRET_KEY === undefined ||
        workerEnv.ZEROSPIN_SECRET_KEY.length === 0 ||
        workerEnv.ZEROSPIN_PUBLISHABLE_KEY === undefined ||
        workerEnv.ZEROSPIN_PUBLISHABLE_KEY.length === 0)
    ) {
      throw new Error(
        'SelfHostedZerospinApis production requires non-empty ZEROSPIN_SECRET_KEY and ZEROSPIN_PUBLISHABLE_KEY secrets',
      );
    }

    this.#runtime = makeDispatchRuntime({
      systemWorkerResolver: WorkerExportsSystemWorkerResolver,
      apiKeyIdentityResolver:
        instanceId === 'local'
          ? makeStaticApiKeyIdentityResolver({
              systemId: workerEnv.ZEROSPIN_SYSTEM_ID,
              deployName: 'zerospin-dev',
              clerkUserId: 'local',
              keyType: 'secret',
            })
          : Layer.succeed(ApiKeyIdentityResolver, {
              resolve: ({ apiKey }) => {
                if (apiKey === workerEnv.ZEROSPIN_SECRET_KEY) {
                  return Effect.succeed({
                    organizationId: 'org_self_hosted',
                    systemId: workerEnv.ZEROSPIN_SYSTEM_ID,
                    systemEnvironmentId: 'production',
                    keyType: 'secret',
                    keyPairName: 'self-hosted',
                  } satisfies ISystemProductionKeyJwtClaims & {
                    readonly organizationId: string;
                  });
                }

                if (apiKey === workerEnv.ZEROSPIN_PUBLISHABLE_KEY) {
                  return Effect.succeed({
                    organizationId: 'org_self_hosted',
                    systemId: workerEnv.ZEROSPIN_SYSTEM_ID,
                    systemEnvironmentId: 'production',
                    keyType: 'publishable',
                    keyPairName: 'self-hosted',
                  } satisfies ISystemProductionKeyJwtClaims & {
                    readonly organizationId: string;
                  });
                }

                return Effect.fail(
                  new ZerospinError({
                    code: 'self-hosted-api-key-invalid',
                    message:
                      'The API key does not match this self-hosted production deployment',
                  }),
                );
              },
            }),
    });

    const db = this.db;
    const { cleanRequest, deploy, deployLog, generation, systemInstance } =
      this.schema;
    const runtime = this.#runtime;
    const workerVersionId = workerEnv.ZEROSPIN_VERSION_METADATA.id;

    this.#apisReadiness = this.repoInitialization.then(() =>
      runtime.runPromise(
        Effect.gen(function* () {
          // 1. Version Metadata is the only reload identity supplied by Wrangler.
          //    Deploy and generation ids are deliberately absent from Wrangler vars.
          if (workerVersionId.length === 0) {
            return yield* new ZerospinError({
              code: 'self-hosted-worker-version-id-missing',
              message: 'ZEROSPIN_VERSION_METADATA.id must be non-empty',
            });
          }

          const currentSystemSpec = yield* Effect.try({
            try: () =>
              Schema.decodeUnknownSync(SystemSpecSchema)(
                makeSystemSpec({ system }),
              ),
            catch: ZerospinError.catch({
              code: 'self-hosted-system-spec-build-failed',
              message: 'Failed to build the current self-hosted SystemSpec',
            }),
          });

          const resolver = yield* SystemWorkerResolver;
          using systemWorker = resolver.get({ systemWorkerName });

          // 2. A Worker version maps to exactly one deploy. A completed mapping
          //    can reopen its pinned API after DO reactivation; running or failed
          //    mappings are terminally fail-closed and never allocate another id.
          const existingDeploy = yield* Effect.try({
            try: () => {
              const storedDeploy = db
                .select()
                .from(deploy)
                .where(eq(deploy.workerVersionId, workerVersionId))
                .get();
              return storedDeploy === undefined
                ? null
                : Schema.decodeUnknownSync(deployRowSchema)(storedDeploy);
            },
            catch: ZerospinError.catch({
              code: 'self-hosted-deploy-read-failed',
              message:
                'Failed to read the self-hosted Worker-version deploy mapping',
            }),
          });

          if (existingDeploy !== null) {
            if (existingDeploy.systemWorkerName !== systemWorkerName) {
              return yield* new ZerospinError({
                code: 'self-hosted-worker-version-instance-conflict',
                message:
                  'The self-hosted Worker version is already mapped to another system instance',
                extra: {
                  workerVersionId,
                  storedSystemWorkerName: existingDeploy.systemWorkerName,
                  requestedSystemWorkerName: systemWorkerName,
                },
              });
            }
            if (existingDeploy.status === 'running') {
              return yield* new ZerospinError({
                code: 'self-hosted-deploy-interrupted',
                message:
                  'This Worker version has an interrupted self-hosted deploy; change the code before deploying again',
                extra: {
                  deployId: existingDeploy.id,
                  phase: existingDeploy.phase,
                  workerVersionId,
                },
              });
            }
            if (existingDeploy.status === 'failed') {
              return yield* new ZerospinError({
                code: 'self-hosted-deploy-previously-failed',
                message:
                  'This Worker version previously failed self-hosted initialization',
                cause:
                  existingDeploy.failure === null
                    ? null
                    : JSON.stringify(existingDeploy.failure),
                extra: {
                  deployId: existingDeploy.id,
                  phase: existingDeploy.phase,
                  workerVersionId,
                },
              });
            }
            if (existingDeploy.phase !== 'complete') {
              return yield* new ZerospinError({
                code: 'self-hosted-succeeded-deploy-incomplete',
                message:
                  'A succeeded self-hosted deploy must be in the complete phase',
                extra: {
                  deployId: existingDeploy.id,
                  phase: existingDeploy.phase,
                },
              });
            }

            const existingInstance = yield* Effect.try({
              try: () => {
                const storedInstance = db
                  .select()
                  .from(systemInstance)
                  .where(eq(systemInstance.systemWorkerName, systemWorkerName))
                  .get();
                return storedInstance === undefined
                  ? null
                  : Schema.decodeUnknownSync(systemInstanceRowSchema)(
                      storedInstance,
                    );
              },
              catch: ZerospinError.catch({
                code: 'self-hosted-instance-read-failed',
                message: 'Failed to read the self-hosted system instance',
              }),
            });
            if (
              existingInstance === null ||
              existingInstance.systemId !== workerEnv.ZEROSPIN_SYSTEM_ID ||
              existingInstance.instanceId !== instanceId ||
              existingInstance.activeDeployId !== existingDeploy.id ||
              existingInstance.activatingDeployId !== null
            ) {
              return yield* new ZerospinError({
                code: 'self-hosted-active-deploy-mismatch',
                message:
                  'The completed Worker-version deploy is not the stable active deploy',
                extra: {
                  deployId: existingDeploy.id,
                  activeDeployId: existingInstance?.activeDeployId ?? null,
                  activatingDeployId:
                    existingInstance?.activatingDeployId ?? null,
                },
              });
            }

            // A promoted deploy remains the routing authority even when source
            // cleanup was interrupted. Retrying that cleanup must never mark
            // the already-succeeded target deploy failed or repoint routing.
            if (existingInstance.transitionSourceDeployId !== null) {
              const transitionSourceDeployId =
                existingInstance.transitionSourceDeployId;
              const cleanup = yield* Effect.gen(function* () {
                const sourceDeploy = yield* Effect.try({
                  try: () => {
                    const storedSourceDeploy = db
                      .select()
                      .from(deploy)
                      .where(eq(deploy.id, transitionSourceDeployId))
                      .get();
                    if (storedSourceDeploy === undefined) {
                      throw new ZerospinError({
                        code: 'self-hosted-transition-source-deploy-not-found',
                        message:
                          'The pending transition source deploy does not exist',
                        extra: {
                          activeDeployId: existingDeploy.id,
                          transitionSourceDeployId,
                        },
                      });
                    }
                    return Schema.decodeUnknownSync(deployRowSchema)(
                      storedSourceDeploy,
                    );
                  },
                  catch: cause =>
                    ZerospinError.isZerospinError(cause)
                      ? cause
                      : new ZerospinError({
                          code: 'self-hosted-transition-source-deploy-read-failed',
                          message:
                            'Failed to read the pending transition source deploy',
                          cause: ZerospinError.prettyUnknownFailure(cause),
                        }),
                });
                if (
                  sourceDeploy.id === existingDeploy.id ||
                  sourceDeploy.systemWorkerName !== systemWorkerName ||
                  sourceDeploy.status !== 'succeeded' ||
                  sourceDeploy.phase !== 'complete'
                ) {
                  return yield* new ZerospinError({
                    code: 'self-hosted-transition-source-deploy-invalid',
                    message:
                      'The pending transition source is not a completed predecessor deploy',
                    extra: {
                      activeDeployId: existingDeploy.id,
                      transitionSourceDeployId: sourceDeploy.id,
                      sourceStatus: sourceDeploy.status,
                      sourcePhase: sourceDeploy.phase,
                    },
                  });
                }

                const completed = yield* makeAsync(
                  () =>
                    systemWorker.drainGeneration({
                      deployId: sourceDeploy.id,
                      generationId: sourceDeploy.generationId,
                      mode: 'complete',
                      successorGenerationId: existingDeploy.generationId,
                    }),
                  ZerospinError.catch({
                    code: 'self-hosted-generation-complete-rpc-failed',
                    message:
                      'SystemWorker failed to complete pending source cleanup',
                  }),
                ).pipe(Effect.flatMap(decodeRpc));
                if (
                  completed.deployId !== sourceDeploy.id ||
                  completed.generationId !== sourceDeploy.generationId ||
                  completed.admission !== 'drained'
                ) {
                  return yield* new ZerospinError({
                    code: 'self-hosted-generation-complete-result-invalid',
                    message:
                      'SystemWorker returned an invalid source cleanup result',
                    extra: {
                      expectedDeployId: sourceDeploy.id,
                      expectedGenerationId: sourceDeploy.generationId,
                      result: completed,
                    },
                  });
                }

                yield* Effect.try({
                  try: () =>
                    db.transaction(tx => {
                      const storedInstance = tx
                        .select()
                        .from(systemInstance)
                        .where(
                          eq(systemInstance.systemWorkerName, systemWorkerName),
                        )
                        .get();
                      if (storedInstance === undefined) {
                        throw new ZerospinError({
                          code: 'self-hosted-instance-not-found',
                          message:
                            'Self-hosted instance disappeared while clearing source cleanup',
                        });
                      }
                      const decodedInstance = Schema.decodeUnknownSync(
                        systemInstanceRowSchema,
                      )(storedInstance);
                      if (
                        decodedInstance.activeDeployId !== existingDeploy.id ||
                        decodedInstance.activatingDeployId !== null ||
                        decodedInstance.transitionSourceDeployId !==
                          sourceDeploy.id
                      ) {
                        throw new ZerospinError({
                          code: 'self-hosted-transition-source-clear-conflict',
                          message:
                            'Self-hosted routing changed while source cleanup was completing',
                          extra: {
                            expectedActiveDeployId: existingDeploy.id,
                            activeDeployId: decodedInstance.activeDeployId,
                            activatingDeployId:
                              decodedInstance.activatingDeployId,
                            expectedTransitionSourceDeployId: sourceDeploy.id,
                            transitionSourceDeployId:
                              decodedInstance.transitionSourceDeployId,
                          },
                        });
                      }
                      tx.update(systemInstance)
                        .set({ transitionSourceDeployId: null })
                        .where(
                          eq(systemInstance.systemWorkerName, systemWorkerName),
                        )
                        .run();
                    }),
                  catch: cause =>
                    ZerospinError.isZerospinError(cause)
                      ? cause
                      : new ZerospinError({
                          code: 'self-hosted-transition-source-clear-failed',
                          message:
                            'Failed to clear completed source cleanup state',
                          cause: ZerospinError.prettyUnknownFailure(cause),
                        }),
                });
              }).pipe(Effect.either);

              if (Either.isLeft(cleanup)) {
                yield* Effect.try({
                  try: () =>
                    db.transaction(tx => {
                      const eventIndexRow = tx
                        .select({
                          next: sql<number>`coalesce(max(${deployLog.eventIndex}), 0) + 1`.mapWith(
                            Number,
                          ),
                        })
                        .from(deployLog)
                        .get();
                      tx.insert(deployLog)
                        .values(
                          Schema.encodeUnknownSync(deployLogRowSchema)({
                            eventIndex: eventIndexRow?.next ?? 1,
                            systemWorkerName,
                            deployId: existingDeploy.id,
                            generationId: existingDeploy.generationId,
                            phase: 'complete',
                            level: 'warn',
                            message:
                              'Self-hosted deploy is active with pending source cleanup',
                            payload: Schema.encodeUnknownSync(
                              ZerospinError.schema,
                            )(cleanup.left),
                            createdAt: new Date(),
                          }),
                        )
                        .run();
                    }),
                  catch: () => cleanup.left,
                }).pipe(Effect.either);
              }
            }

            return new ZerospinApis({
              deployId: existingDeploy.id,
              generationId: existingDeploy.generationId,
              runtime,
            });
          }

          // 3. Resolve the stable active predecessor. Only a succeeded/complete
          //    deploy may select lineage for the next Worker version.
          const activeState = yield* Effect.try({
            try: () =>
              db.transaction(tx => {
                const storedInstance = tx
                  .select()
                  .from(systemInstance)
                  .where(eq(systemInstance.systemWorkerName, systemWorkerName))
                  .get();
                if (storedInstance === undefined) {
                  return {
                    instance: null,
                    activeDeploy: null,
                  };
                }

                const instance = Schema.decodeUnknownSync(
                  systemInstanceRowSchema,
                )(storedInstance);
                if (
                  instance.systemId !== workerEnv.ZEROSPIN_SYSTEM_ID ||
                  instance.instanceId !== instanceId
                ) {
                  throw new ZerospinError({
                    code: 'self-hosted-instance-identity-conflict',
                    message:
                      'Stored self-hosted instance identity does not match its Durable Object name',
                    extra: {
                      systemWorkerName,
                      storedSystemId: instance.systemId,
                      storedInstanceId: instance.instanceId,
                    },
                  });
                }
                if (instance.activatingDeployId !== null) {
                  throw new ZerospinError({
                    code: 'self-hosted-activation-interrupted',
                    message:
                      'A prior self-hosted deploy still owns the activation reservation',
                    extra: {
                      activatingDeployId: instance.activatingDeployId,
                    },
                  });
                }
                if (instance.activeDeployId === null) {
                  if (instance.transitionSourceDeployId !== null) {
                    throw new ZerospinError({
                      code: 'self-hosted-transition-source-without-active-deploy',
                      message:
                        'A self-hosted transition source requires an active target deploy',
                      extra: {
                        transitionSourceDeployId:
                          instance.transitionSourceDeployId,
                      },
                    });
                  }
                  return {
                    instance,
                    activeDeploy: null,
                  };
                }

                const storedActiveDeploy = tx
                  .select()
                  .from(deploy)
                  .where(eq(deploy.id, instance.activeDeployId))
                  .get();
                if (storedActiveDeploy === undefined) {
                  throw new ZerospinError({
                    code: 'self-hosted-active-deploy-not-found',
                    message: 'The self-hosted activeDeployId has no deploy row',
                    extra: { activeDeployId: instance.activeDeployId },
                  });
                }
                const activeDeploy =
                  Schema.decodeUnknownSync(deployRowSchema)(storedActiveDeploy);
                if (
                  activeDeploy.systemWorkerName !== systemWorkerName ||
                  activeDeploy.status !== 'succeeded' ||
                  activeDeploy.phase !== 'complete'
                ) {
                  throw new ZerospinError({
                    code: 'self-hosted-active-deploy-invalid',
                    message:
                      'The self-hosted active deploy is not a succeeded complete deploy for this instance',
                    extra: {
                      activeDeployId: activeDeploy.id,
                      status: activeDeploy.status,
                      phase: activeDeploy.phase,
                    },
                  });
                }
                return {
                  instance,
                  activeDeploy,
                };
              }),
            catch: cause =>
              ZerospinError.isZerospinError(cause)
                ? cause
                : new ZerospinError({
                    code: 'self-hosted-active-state-read-failed',
                    message:
                      'Failed to read self-hosted active deployment state',
                    cause: ZerospinError.prettyUnknownFailure(cause),
                  }),
          });

          // A source distinct from the active deploy is deferred post-switch
          // cleanup. Finish it before allocating another candidate so this one
          // scalar receipt can never be overwritten by a later transition.
          if (
            activeState.instance !== null &&
            activeState.activeDeploy !== null &&
            activeState.instance.transitionSourceDeployId !== null &&
            activeState.instance.transitionSourceDeployId !==
              activeState.activeDeploy.id
          ) {
            const transitionSourceDeployId =
              activeState.instance.transitionSourceDeployId;
            const transitionSourceDeploy = yield* Effect.try({
              try: () => {
                const storedTransitionSourceDeploy = db
                  .select()
                  .from(deploy)
                  .where(eq(deploy.id, transitionSourceDeployId))
                  .get();
                if (storedTransitionSourceDeploy === undefined) {
                  throw new ZerospinError({
                    code: 'self-hosted-transition-source-deploy-not-found',
                    message:
                      'The pending transition source deploy does not exist',
                    extra: {
                      activeDeployId: activeState.activeDeploy.id,
                      transitionSourceDeployId,
                    },
                  });
                }
                return Schema.decodeUnknownSync(deployRowSchema)(
                  storedTransitionSourceDeploy,
                );
              },
              catch: cause =>
                ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'self-hosted-transition-source-deploy-read-failed',
                      message:
                        'Failed to read the pending transition source deploy',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
            });
            if (
              transitionSourceDeploy.systemWorkerName !== systemWorkerName ||
              transitionSourceDeploy.status !== 'succeeded' ||
              transitionSourceDeploy.phase !== 'complete'
            ) {
              return yield* new ZerospinError({
                code: 'self-hosted-transition-source-deploy-invalid',
                message:
                  'The pending transition source is not a completed predecessor deploy',
                extra: {
                  activeDeployId: activeState.activeDeploy.id,
                  transitionSourceDeployId: transitionSourceDeploy.id,
                  sourceStatus: transitionSourceDeploy.status,
                  sourcePhase: transitionSourceDeploy.phase,
                },
              });
            }

            const completed = yield* makeAsync(
              () =>
                systemWorker.drainGeneration({
                  deployId: transitionSourceDeploy.id,
                  generationId: transitionSourceDeploy.generationId,
                  mode: 'complete',
                  successorGenerationId: activeState.activeDeploy.generationId,
                }),
              ZerospinError.catch({
                code: 'self-hosted-generation-complete-rpc-failed',
                message:
                  'SystemWorker failed to complete pending source cleanup',
              }),
            ).pipe(Effect.flatMap(decodeRpc));
            if (
              completed.deployId !== transitionSourceDeploy.id ||
              completed.generationId !== transitionSourceDeploy.generationId ||
              completed.admission !== 'drained'
            ) {
              return yield* new ZerospinError({
                code: 'self-hosted-generation-complete-result-invalid',
                message:
                  'SystemWorker returned an invalid source cleanup result',
                extra: {
                  expectedDeployId: transitionSourceDeploy.id,
                  expectedGenerationId: transitionSourceDeploy.generationId,
                  result: completed,
                },
              });
            }

            yield* Effect.try({
              try: () =>
                db.transaction(tx => {
                  const storedInstance = tx
                    .select()
                    .from(systemInstance)
                    .where(
                      eq(systemInstance.systemWorkerName, systemWorkerName),
                    )
                    .get();
                  if (storedInstance === undefined) {
                    throw new ZerospinError({
                      code: 'self-hosted-instance-not-found',
                      message:
                        'Self-hosted instance disappeared while clearing source cleanup',
                    });
                  }
                  const decodedInstance = Schema.decodeUnknownSync(
                    systemInstanceRowSchema,
                  )(storedInstance);
                  if (
                    decodedInstance.activeDeployId !==
                      activeState.activeDeploy.id ||
                    decodedInstance.activatingDeployId !== null ||
                    decodedInstance.transitionSourceDeployId !==
                      transitionSourceDeploy.id
                  ) {
                    throw new ZerospinError({
                      code: 'self-hosted-transition-source-clear-conflict',
                      message:
                        'Self-hosted routing changed while source cleanup was completing',
                      extra: {
                        expectedActiveDeployId: activeState.activeDeploy.id,
                        activeDeployId: decodedInstance.activeDeployId,
                        activatingDeployId: decodedInstance.activatingDeployId,
                        expectedTransitionSourceDeployId:
                          transitionSourceDeploy.id,
                        transitionSourceDeployId:
                          decodedInstance.transitionSourceDeployId,
                      },
                    });
                  }
                  tx.update(systemInstance)
                    .set({ transitionSourceDeployId: null })
                    .where(
                      eq(systemInstance.systemWorkerName, systemWorkerName),
                    )
                    .run();
                }),
              catch: cause =>
                ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'self-hosted-transition-source-clear-failed',
                      message: 'Failed to clear completed source cleanup state',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
            });
          }

          const cleanRequestId =
            workerEnv.ZEROSPIN_CLEAN_REQUEST_ID === undefined
              ? undefined
              : Schema.decodeUnknownSync(
                  makeEffectSchema({
                    id: selfHostedZerospinApisRepoTables.cleanRequest.shape.id,
                  }),
                )({ id: workerEnv.ZEROSPIN_CLEAN_REQUEST_ID }).id;
          const existingCleanRequest = yield* Effect.try({
            try: () => {
              if (cleanRequestId === undefined) {
                return null;
              }
              const storedCleanRequest = db
                .select()
                .from(cleanRequest)
                .where(eq(cleanRequest.id, cleanRequestId))
                .get();
              if (storedCleanRequest === undefined) {
                return null;
              }
              const decodedCleanRequest = Schema.decodeUnknownSync(
                cleanRequestRowSchema,
              )(storedCleanRequest);
              const selectedDeploy = db
                .select()
                .from(deploy)
                .where(eq(deploy.id, decodedCleanRequest.deployId))
                .get();
              if (selectedDeploy === undefined) {
                throw new ZerospinError({
                  code: 'self-hosted-clean-request-deploy-not-found',
                  message: 'The consumed clean request has no selected deploy',
                  extra: {
                    cleanRequestId,
                    deployId: decodedCleanRequest.deployId,
                  },
                });
              }
              const decodedSelectedDeploy =
                Schema.decodeUnknownSync(deployRowSchema)(selectedDeploy);
              if (
                decodedSelectedDeploy.generationId !==
                decodedCleanRequest.generationId
              ) {
                throw new ZerospinError({
                  code: 'self-hosted-clean-request-generation-mismatch',
                  message:
                    'The consumed clean request does not match its selected deploy generation',
                  extra: {
                    cleanRequestId,
                    deployId: decodedCleanRequest.deployId,
                    cleanRequestGenerationId: decodedCleanRequest.generationId,
                    deployGenerationId: decodedSelectedDeploy.generationId,
                  },
                });
              }
              return decodedCleanRequest;
            },
            catch: cause =>
              ZerospinError.isZerospinError(cause)
                ? cause
                : new ZerospinError({
                    code: 'self-hosted-clean-request-read-failed',
                    message:
                      'Failed to read the self-hosted clean request receipt',
                    cause: ZerospinError.prettyUnknownFailure(cause),
                  }),
          });
          const isClean =
            cleanRequestId !== undefined && existingCleanRequest === null;

          // 4. Compatibility is evaluated only for ordinary reloads. Initial and
          //    clean deployments intentionally create detached root generations.
          const compatibility =
            activeState.activeDeploy === null || isClean
              ? null
              : yield* checkSystemCompatibility({
                  prior: activeState.activeDeploy.systemSpec,
                  next: currentSystemSpec,
                });
          const createsGeneration =
            activeState.activeDeploy === null ||
            isClean ||
            compatibility?.requiresNewGeneration === true;
          if (
            activeState.instance !== null &&
            activeState.activeDeploy !== null &&
            activeState.instance.transitionSourceDeployId ===
              activeState.activeDeploy.id &&
            !createsGeneration
          ) {
            return yield* new ZerospinError({
              code: 'self-hosted-frozen-generation-reuse-rejected',
              message:
                'A generation with frozen write admission cannot be reused',
              extra: {
                activeDeployId: activeState.activeDeploy.id,
                generationId: activeState.activeDeploy.generationId,
              },
            });
          }
          const deployId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.deploy,
          });
          const generationId = createsGeneration
            ? yield* makeIdFromAbbreviation({
                abbreviation: coreAbbreviations.generation,
              })
            : activeState.activeDeploy === null
              ? yield* new ZerospinError({
                  code: 'self-hosted-reused-generation-missing',
                  message:
                    'A reused generation requires an active predecessor deploy',
                })
              : activeState.activeDeploy.generationId;
          const prevGenerationId =
            createsGeneration && !isClean && activeState.activeDeploy !== null
              ? activeState.activeDeploy.generationId
              : null;
          const startedAt = yield* dutils.date();

          // 5. Allocate the candidate, generation, clean receipt, and first log
          //    atomically. This is the only allocation point for workerVersionId.
          const candidate = yield* Effect.try({
            try: () =>
              db.transaction(tx => {
                const currentStoredInstance = tx
                  .select()
                  .from(systemInstance)
                  .where(eq(systemInstance.systemWorkerName, systemWorkerName))
                  .get();

                if (currentStoredInstance === undefined) {
                  const encodedInstance = Schema.encodeUnknownSync(
                    systemInstanceRowSchema,
                  )({
                    systemWorkerName,
                    systemId: workerEnv.ZEROSPIN_SYSTEM_ID,
                    instanceId,
                    activeDeployId: null,
                    activatingDeployId: null,
                    transitionSourceDeployId: null,
                  });
                  tx.insert(systemInstance).values(encodedInstance).run();
                } else {
                  const currentInstance = Schema.decodeUnknownSync(
                    systemInstanceRowSchema,
                  )(currentStoredInstance);
                  if (
                    currentInstance.activeDeployId !==
                      activeState.instance?.activeDeployId ||
                    currentInstance.activatingDeployId !== null ||
                    (currentInstance.transitionSourceDeployId !== null &&
                      currentInstance.transitionSourceDeployId !==
                        currentInstance.activeDeployId)
                  ) {
                    throw new ZerospinError({
                      code: 'self-hosted-deploy-allocation-stale',
                      message:
                        'Self-hosted active deployment state changed before candidate allocation',
                      extra: {
                        expectedActiveDeployId:
                          activeState.instance?.activeDeployId ?? null,
                        activeDeployId: currentInstance.activeDeployId,
                        activatingDeployId: currentInstance.activatingDeployId,
                        transitionSourceDeployId:
                          currentInstance.transitionSourceDeployId,
                      },
                    });
                  }
                }

                const storedGeneration = tx
                  .select()
                  .from(generation)
                  .where(eq(generation.id, generationId))
                  .get();
                if (createsGeneration) {
                  if (storedGeneration !== undefined) {
                    throw new ZerospinError({
                      code: 'self-hosted-generation-id-conflict',
                      message:
                        'The newly allocated self-hosted generationId already exists',
                      extra: { generationId },
                    });
                  }
                  const encodedGeneration = Schema.encodeUnknownSync(
                    generationRowSchema,
                  )({
                    id: generationId,
                    prevGenerationId,
                  });
                  tx.insert(generation).values(encodedGeneration).run();
                } else {
                  if (storedGeneration === undefined) {
                    throw new ZerospinError({
                      code: 'self-hosted-reused-generation-not-found',
                      message: 'The selected reused generation does not exist',
                      extra: { generationId },
                    });
                  }
                  const decodedGeneration =
                    Schema.decodeUnknownSync(generationRowSchema)(
                      storedGeneration,
                    );
                  if (
                    activeState.activeDeploy?.generationId !==
                      decodedGeneration.id ||
                    decodedGeneration.id !== generationId
                  ) {
                    throw new ZerospinError({
                      code: 'self-hosted-inactive-generation-reuse',
                      message:
                        'Only the active self-hosted generation may be reused',
                      extra: {
                        generationId,
                        activeGenerationId:
                          activeState.activeDeploy?.generationId ?? null,
                      },
                    });
                  }
                }

                const deployIndexRow = tx
                  .select({
                    next: sql<number>`coalesce(max(${deploy.deployIndex}), 0) + 1`.mapWith(
                      Number,
                    ),
                  })
                  .from(deploy)
                  .where(eq(deploy.systemWorkerName, systemWorkerName))
                  .get();
                const deployIndex = deployIndexRow?.next ?? 1;
                const encodedCandidate = Schema.encodeUnknownSync(
                  deployRowSchema,
                )({
                  id: deployId,
                  systemWorkerName,
                  deployIndex,
                  prevDeployId: activeState.instance?.activeDeployId ?? null,
                  generationId,
                  workerVersionId,
                  cloudflareDeploymentId: null,
                  systemSpec: currentSystemSpec,
                  status: 'running',
                  phase: 'checking',
                  startedAt,
                  completedAt: null,
                  failure: null,
                });
                tx.insert(deploy).values(encodedCandidate).run();

                if (isClean && cleanRequestId !== undefined) {
                  const storedCleanRequest = tx
                    .select()
                    .from(cleanRequest)
                    .where(eq(cleanRequest.id, cleanRequestId))
                    .get();
                  if (storedCleanRequest !== undefined) {
                    throw new ZerospinError({
                      code: 'self-hosted-clean-request-already-consumed',
                      message:
                        'The clean request was consumed before candidate allocation completed',
                      extra: { cleanRequestId },
                    });
                  }
                  const encodedCleanRequest = Schema.encodeUnknownSync(
                    cleanRequestRowSchema,
                  )({
                    id: cleanRequestId,
                    deployId,
                    generationId,
                    consumedAt: startedAt,
                  });
                  tx.insert(cleanRequest).values(encodedCleanRequest).run();
                }

                const eventIndexRow = tx
                  .select({
                    next: sql<number>`coalesce(max(${deployLog.eventIndex}), 0) + 1`.mapWith(
                      Number,
                    ),
                  })
                  .from(deployLog)
                  .get();
                const encodedLog = Schema.encodeUnknownSync(deployLogRowSchema)(
                  {
                    eventIndex: eventIndexRow?.next ?? 1,
                    systemWorkerName,
                    deployId,
                    generationId,
                    phase: 'checking',
                    level: 'info',
                    message: 'Self-hosted deploy candidate allocated',
                    payload:
                      compatibility === null
                        ? {
                            cleanRequestId: isClean ? cleanRequestId : null,
                            initial: activeState.activeDeploy === null,
                          }
                        : compatibility,
                    createdAt: startedAt,
                  },
                );
                tx.insert(deployLog).values(encodedLog).run();
                return Schema.decodeUnknownSync(deployRowSchema)(
                  encodedCandidate,
                );
              }),
            catch: cause =>
              ZerospinError.isZerospinError(cause)
                ? cause
                : new ZerospinError({
                    code: 'self-hosted-deploy-allocation-failed',
                    message:
                      'Failed to allocate the self-hosted deploy candidate',
                    cause: ZerospinError.prettyUnknownFailure(cause),
                    extra: { workerVersionId, systemWorkerName },
                  }),
          });

          return yield* Effect.gen(function* () {
            // 6. Missing adapter coverage is a recorded checking failure. The
            //    self-hosted lifecycle never waives data compatibility.
            if (
              compatibility !== null &&
              compatibility.missingAdapters.length > 0
            ) {
              return yield* new ZerospinError({
                code: 'self-hosted-system-incompatible',
                message:
                  instanceId === 'local'
                    ? 'The self-hosted system changed incompatibly; add the reported mutation adapters or rerun zerospin dev --clean'
                    : 'The self-hosted production system changed incompatibly; add the reported mutation adapters before deploying again',
                extra: {
                  requiredBump: compatibility.requiredBump,
                  diffs: compatibility.diffs,
                  missingAdapters: compatibility.missingAdapters,
                },
              });
            }

            // 7. Every replacement freezes the active source before target
            //    preparation. A clean target remains a detached root because
            //    prevGenerationId stays null; freezing only closes the source.
            if (activeState.activeDeploy !== null && createsGeneration) {
              const sourceDeploy = activeState.activeDeploy;
              const drainingAt = yield* dutils.date();
              yield* Effect.try({
                try: () =>
                  db.transaction(tx => {
                    const storedCandidate = tx
                      .select()
                      .from(deploy)
                      .where(eq(deploy.id, candidate.id))
                      .get();
                    if (storedCandidate === undefined) {
                      throw new ZerospinError({
                        code: 'self-hosted-deploy-not-found',
                        message:
                          'Self-hosted deploy disappeared before drain inspection',
                        extra: { deployId: candidate.id },
                      });
                    }
                    const storedInstance = tx
                      .select()
                      .from(systemInstance)
                      .where(
                        eq(systemInstance.systemWorkerName, systemWorkerName),
                      )
                      .get();
                    if (storedInstance === undefined) {
                      throw new ZerospinError({
                        code: 'self-hosted-instance-not-found',
                        message:
                          'Self-hosted instance disappeared before generation freeze',
                      });
                    }
                    const decodedCandidate =
                      Schema.decodeUnknownSync(deployRowSchema)(
                        storedCandidate,
                      );
                    const decodedInstance = Schema.decodeUnknownSync(
                      systemInstanceRowSchema,
                    )(storedInstance);
                    if (
                      decodedCandidate.status !== 'running' ||
                      decodedCandidate.phase !== 'checking'
                    ) {
                      throw new ZerospinError({
                        code: 'self-hosted-deploy-phase-conflict',
                        message:
                          'Only a running checking deploy may enter draining',
                        extra: {
                          deployId: candidate.id,
                          status: decodedCandidate.status,
                          phase: decodedCandidate.phase,
                        },
                      });
                    }
                    if (
                      decodedInstance.activeDeployId !== sourceDeploy.id ||
                      decodedInstance.activatingDeployId !== null ||
                      (decodedInstance.transitionSourceDeployId !== null &&
                        decodedInstance.transitionSourceDeployId !==
                          sourceDeploy.id)
                    ) {
                      throw new ZerospinError({
                        code: 'self-hosted-generation-freeze-source-conflict',
                        message:
                          'Self-hosted routing changed before the source generation freeze',
                        extra: {
                          expectedActiveDeployId: sourceDeploy.id,
                          activeDeployId: decodedInstance.activeDeployId,
                          activatingDeployId:
                            decodedInstance.activatingDeployId,
                          transitionSourceDeployId:
                            decodedInstance.transitionSourceDeployId,
                        },
                      });
                    }
                    tx.update(deploy)
                      .set({ phase: 'draining' })
                      .where(eq(deploy.id, candidate.id))
                      .run();
                    tx.update(systemInstance)
                      .set({ transitionSourceDeployId: sourceDeploy.id })
                      .where(
                        eq(systemInstance.systemWorkerName, systemWorkerName),
                      )
                      .run();

                    const eventIndexRow = tx
                      .select({
                        next: sql<number>`coalesce(max(${deployLog.eventIndex}), 0) + 1`.mapWith(
                          Number,
                        ),
                      })
                      .from(deployLog)
                      .get();
                    const encodedLog = Schema.encodeUnknownSync(
                      deployLogRowSchema,
                    )({
                      eventIndex: eventIndexRow?.next ?? 1,
                      systemWorkerName,
                      deployId: candidate.id,
                      generationId: candidate.generationId,
                      phase: 'draining',
                      level: 'info',
                      message: 'Freezing the prior self-hosted generation',
                      payload: {
                        priorDeployId: sourceDeploy.id,
                        priorGenerationId: sourceDeploy.generationId,
                        detachedTarget: isClean,
                      },
                      createdAt: drainingAt,
                    });
                    tx.insert(deployLog).values(encodedLog).run();
                  }),
                catch: cause =>
                  ZerospinError.isZerospinError(cause)
                    ? cause
                    : new ZerospinError({
                        code: 'self-hosted-deploy-draining-transition-failed',
                        message:
                          'Failed to persist the self-hosted draining transition',
                        cause: ZerospinError.prettyUnknownFailure(cause),
                      }),
              });

              const frozen = yield* makeAsync(
                () =>
                  systemWorker.drainGeneration({
                    deployId: sourceDeploy.id,
                    generationId: sourceDeploy.generationId,
                    mode: 'freeze',
                    successorGenerationId: null,
                  }),
                ZerospinError.catch({
                  code: 'self-hosted-generation-freeze-rpc-failed',
                  message:
                    'SystemWorker failed to freeze the prior self-hosted generation',
                }),
              ).pipe(Effect.flatMap(decodeRpc));
              if (
                frozen.deployId !== sourceDeploy.id ||
                frozen.generationId !== sourceDeploy.generationId ||
                frozen.admission !== 'draining'
              ) {
                return yield* new ZerospinError({
                  code: 'self-hosted-generation-freeze-result-invalid',
                  message:
                    'SystemWorker returned an invalid self-hosted freeze result',
                  extra: {
                    expectedDeployId: sourceDeploy.id,
                    expectedGenerationId: sourceDeploy.generationId,
                    result: frozen,
                  },
                });
              }
            }

            // 8. Preparation is one blocking RPC. Seeds are evaluated and passed
            //    only for the first consumption of an explicit cleanRequestId.
            const preparingAt = yield* dutils.date();
            yield* Effect.try({
              try: () =>
                db.transaction(tx => {
                  const storedCandidate = tx
                    .select()
                    .from(deploy)
                    .where(eq(deploy.id, candidate.id))
                    .get();
                  if (storedCandidate === undefined) {
                    throw new ZerospinError({
                      code: 'self-hosted-deploy-not-found',
                      message:
                        'Self-hosted deploy disappeared before generation preparation',
                      extra: { deployId: candidate.id },
                    });
                  }
                  const decodedCandidate =
                    Schema.decodeUnknownSync(deployRowSchema)(storedCandidate);
                  if (
                    decodedCandidate.status !== 'running' ||
                    (decodedCandidate.phase !== 'checking' &&
                      decodedCandidate.phase !== 'draining')
                  ) {
                    throw new ZerospinError({
                      code: 'self-hosted-deploy-phase-conflict',
                      message:
                        'Only a checked or drained running deploy may enter preparing',
                      extra: {
                        deployId: candidate.id,
                        status: decodedCandidate.status,
                        phase: decodedCandidate.phase,
                      },
                    });
                  }
                  tx.update(deploy)
                    .set({ phase: 'preparing' })
                    .where(eq(deploy.id, candidate.id))
                    .run();

                  const eventIndexRow = tx
                    .select({
                      next: sql<number>`coalesce(max(${deployLog.eventIndex}), 0) + 1`.mapWith(
                        Number,
                      ),
                    })
                    .from(deployLog)
                    .get();
                  const encodedLog = Schema.encodeUnknownSync(
                    deployLogRowSchema,
                  )({
                    eventIndex: eventIndexRow?.next ?? 1,
                    systemWorkerName,
                    deployId: candidate.id,
                    generationId: candidate.generationId,
                    phase: 'preparing',
                    level: 'info',
                    message: 'Preparing the selected self-hosted generation',
                    payload: {
                      cleanRequestId: isClean ? cleanRequestId : null,
                      prevGenerationId,
                      reusedGeneration: !createsGeneration,
                    },
                    createdAt: preparingAt,
                  });
                  tx.insert(deployLog).values(encodedLog).run();
                }),
              catch: cause =>
                ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'self-hosted-deploy-preparing-transition-failed',
                      message:
                        'Failed to persist the self-hosted preparing transition',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
            });

            const preparationSeeds = isClean ? yield* seeds : [];
            const prepared = yield* makeAsync(
              () =>
                systemWorker.prepareGeneration({
                  deployId: candidate.id,
                  generationId: candidate.generationId,
                  prevGenerationId,
                  systemSpec: currentSystemSpec,
                  seeds: preparationSeeds,
                }),
              ZerospinError.catch({
                code: 'self-hosted-generation-prepare-rpc-failed',
                message:
                  'SystemWorker failed to prepare the self-hosted generation',
              }),
            ).pipe(Effect.flatMap(decodeRpc));
            if (
              prepared.deployId !== candidate.id ||
              prepared.generationId !== candidate.generationId ||
              prepared.readiness !== 'ready' ||
              prepared.reusedGeneration !== !createsGeneration
            ) {
              return yield* new ZerospinError({
                code: 'self-hosted-generation-prepare-result-invalid',
                message:
                  'SystemWorker returned an invalid self-hosted preparation result',
                extra: {
                  expectedDeployId: candidate.id,
                  expectedGenerationId: candidate.generationId,
                  expectedReusedGeneration: !createsGeneration,
                  result: prepared,
                },
              });
            }

            // 9. Reserve activation with a self-hosted compare-and-swap before
            //    opening the generation. The stable pointer does not move yet.
            const activatingAt = yield* dutils.date();
            yield* Effect.try({
              try: () =>
                db.transaction(tx => {
                  const storedCandidate = tx
                    .select()
                    .from(deploy)
                    .where(eq(deploy.id, candidate.id))
                    .get();
                  const storedInstance = tx
                    .select()
                    .from(systemInstance)
                    .where(
                      eq(systemInstance.systemWorkerName, systemWorkerName),
                    )
                    .get();
                  if (
                    storedCandidate === undefined ||
                    storedInstance === undefined
                  ) {
                    throw new ZerospinError({
                      code: 'self-hosted-activation-state-not-found',
                      message:
                        'Self-hosted deploy or instance disappeared before activation reservation',
                      extra: { deployId: candidate.id, systemWorkerName },
                    });
                  }
                  const decodedCandidate =
                    Schema.decodeUnknownSync(deployRowSchema)(storedCandidate);
                  const decodedInstance = Schema.decodeUnknownSync(
                    systemInstanceRowSchema,
                  )(storedInstance);
                  if (
                    decodedCandidate.status !== 'running' ||
                    decodedCandidate.phase !== 'preparing'
                  ) {
                    throw new ZerospinError({
                      code: 'self-hosted-deploy-not-ready-for-activation',
                      message:
                        'Only a running prepared deploy may reserve self-hosted activation',
                      extra: {
                        deployId: candidate.id,
                        status: decodedCandidate.status,
                        phase: decodedCandidate.phase,
                      },
                    });
                  }
                  if (
                    decodedInstance.activeDeployId !==
                    decodedCandidate.prevDeployId
                  ) {
                    throw new ZerospinError({
                      code: 'self-hosted-stale-deploy-activation',
                      message:
                        'The active self-hosted deploy changed after candidate allocation',
                      extra: {
                        deployId: candidate.id,
                        prevDeployId: decodedCandidate.prevDeployId,
                        activeDeployId: decodedInstance.activeDeployId,
                      },
                    });
                  }
                  if (decodedInstance.activatingDeployId !== null) {
                    throw new ZerospinError({
                      code: 'self-hosted-concurrent-deploy-activation',
                      message:
                        'Another self-hosted deploy already owns the activation reservation',
                      extra: {
                        deployId: candidate.id,
                        activatingDeployId: decodedInstance.activatingDeployId,
                      },
                    });
                  }
                  const expectedTransitionSourceDeployId =
                    createsGeneration && decodedCandidate.prevDeployId !== null
                      ? decodedCandidate.prevDeployId
                      : null;
                  if (
                    decodedInstance.transitionSourceDeployId !==
                    expectedTransitionSourceDeployId
                  ) {
                    throw new ZerospinError({
                      code: 'self-hosted-transition-source-reservation-mismatch',
                      message:
                        'Activation requires the exact frozen source receipt',
                      extra: {
                        deployId: candidate.id,
                        expectedTransitionSourceDeployId,
                        transitionSourceDeployId:
                          decodedInstance.transitionSourceDeployId,
                      },
                    });
                  }

                  tx.update(deploy)
                    .set({ phase: 'activating' })
                    .where(eq(deploy.id, candidate.id))
                    .run();
                  tx.update(systemInstance)
                    .set({ activatingDeployId: candidate.id })
                    .where(
                      eq(systemInstance.systemWorkerName, systemWorkerName),
                    )
                    .run();

                  const eventIndexRow = tx
                    .select({
                      next: sql<number>`coalesce(max(${deployLog.eventIndex}), 0) + 1`.mapWith(
                        Number,
                      ),
                    })
                    .from(deployLog)
                    .get();
                  const encodedLog = Schema.encodeUnknownSync(
                    deployLogRowSchema,
                  )({
                    eventIndex: eventIndexRow?.next ?? 1,
                    systemWorkerName,
                    deployId: candidate.id,
                    generationId: candidate.generationId,
                    phase: 'activating',
                    level: 'info',
                    message: 'Reserved self-hosted deploy activation',
                    payload: { prevDeployId: decodedCandidate.prevDeployId },
                    createdAt: activatingAt,
                  });
                  tx.insert(deployLog).values(encodedLog).run();
                }),
              catch: cause =>
                ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'self-hosted-deploy-activation-reservation-failed',
                      message:
                        'Failed to reserve self-hosted deploy activation',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
            });

            const opened = yield* makeAsync(
              () =>
                systemWorker.openGeneration({
                  deployId: candidate.id,
                  generationId: candidate.generationId,
                }),
              ZerospinError.catch({
                code: 'self-hosted-generation-open-rpc-failed',
                message:
                  'SystemWorker failed to open the self-hosted generation',
              }),
            ).pipe(Effect.flatMap(decodeRpc));
            if (
              opened.deployId !== candidate.id ||
              opened.generationId !== candidate.generationId ||
              opened.workerVersionId !== workerVersionId
            ) {
              return yield* new ZerospinError({
                code: 'self-hosted-generation-open-result-invalid',
                message:
                  'SystemWorker returned an invalid self-hosted open result',
                extra: {
                  expectedDeployId: candidate.id,
                  expectedGenerationId: candidate.generationId,
                  expectedWorkerVersionId: workerVersionId,
                  result: opened,
                },
              });
            }

            // 10. Final promotion atomically completes the deploy, moves the
            //     stable pointer, and clears the activation reservation.
            const completedAt = yield* dutils.date();
            yield* Effect.try({
              try: () =>
                db.transaction(tx => {
                  const storedCandidate = tx
                    .select()
                    .from(deploy)
                    .where(eq(deploy.id, candidate.id))
                    .get();
                  const storedInstance = tx
                    .select()
                    .from(systemInstance)
                    .where(
                      eq(systemInstance.systemWorkerName, systemWorkerName),
                    )
                    .get();
                  if (
                    storedCandidate === undefined ||
                    storedInstance === undefined
                  ) {
                    throw new ZerospinError({
                      code: 'self-hosted-activation-state-not-found',
                      message:
                        'Self-hosted deploy or instance disappeared before final promotion',
                      extra: { deployId: candidate.id, systemWorkerName },
                    });
                  }
                  const decodedCandidate =
                    Schema.decodeUnknownSync(deployRowSchema)(storedCandidate);
                  const decodedInstance = Schema.decodeUnknownSync(
                    systemInstanceRowSchema,
                  )(storedInstance);
                  const expectedTransitionSourceDeployId =
                    createsGeneration && decodedCandidate.prevDeployId !== null
                      ? decodedCandidate.prevDeployId
                      : null;
                  if (
                    decodedCandidate.status !== 'running' ||
                    decodedCandidate.phase !== 'activating' ||
                    decodedInstance.activeDeployId !==
                      decodedCandidate.prevDeployId ||
                    decodedInstance.activatingDeployId !== candidate.id ||
                    decodedInstance.transitionSourceDeployId !==
                      expectedTransitionSourceDeployId
                  ) {
                    throw new ZerospinError({
                      code: 'self-hosted-deploy-activation-reservation-lost',
                      message:
                        'Final self-hosted promotion requires the original predecessor and reservation',
                      extra: {
                        deployId: candidate.id,
                        status: decodedCandidate.status,
                        phase: decodedCandidate.phase,
                        prevDeployId: decodedCandidate.prevDeployId,
                        activeDeployId: decodedInstance.activeDeployId,
                        activatingDeployId: decodedInstance.activatingDeployId,
                        expectedTransitionSourceDeployId,
                        transitionSourceDeployId:
                          decodedInstance.transitionSourceDeployId,
                      },
                    });
                  }
                  const encodedCompletedDeploy = Schema.encodeUnknownSync(
                    deployRowSchema,
                  )({
                    ...decodedCandidate,
                    workerVersionId,
                    status: 'succeeded',
                    phase: 'complete',
                    completedAt,
                    failure: null,
                  });
                  tx.update(deploy)
                    .set({
                      workerVersionId: encodedCompletedDeploy.workerVersionId,
                      status: encodedCompletedDeploy.status,
                      phase: encodedCompletedDeploy.phase,
                      completedAt: encodedCompletedDeploy.completedAt,
                      failure: encodedCompletedDeploy.failure,
                    })
                    .where(eq(deploy.id, candidate.id))
                    .run();
                  tx.update(systemInstance)
                    .set({
                      activeDeployId: candidate.id,
                      activatingDeployId: null,
                    })
                    .where(
                      eq(systemInstance.systemWorkerName, systemWorkerName),
                    )
                    .run();

                  const eventIndexRow = tx
                    .select({
                      next: sql<number>`coalesce(max(${deployLog.eventIndex}), 0) + 1`.mapWith(
                        Number,
                      ),
                    })
                    .from(deployLog)
                    .get();
                  const encodedLog = Schema.encodeUnknownSync(
                    deployLogRowSchema,
                  )({
                    eventIndex: eventIndexRow?.next ?? 1,
                    systemWorkerName,
                    deployId: candidate.id,
                    generationId: candidate.generationId,
                    phase: 'complete',
                    level: 'info',
                    message: 'Self-hosted deploy activated',
                    payload: { workerVersionId },
                    createdAt: completedAt,
                  });
                  tx.insert(deployLog).values(encodedLog).run();
                }),
              catch: cause =>
                ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'self-hosted-deploy-promotion-failed',
                      message: 'Failed to promote the self-hosted deploy',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
            });

            // 11. Routing now selects the ready target. Source read admission
            //     closes only after this point. Cleanup failure is durable in
            //     transitionSourceDeployId and never rolls the target back.
            if (activeState.activeDeploy !== null && createsGeneration) {
              const sourceDeploy = activeState.activeDeploy;
              const cleanup = yield* Effect.gen(function* () {
                const drained = yield* makeAsync(
                  () =>
                    systemWorker.drainGeneration({
                      deployId: sourceDeploy.id,
                      generationId: sourceDeploy.generationId,
                      mode: 'complete',
                      successorGenerationId: candidate.generationId,
                    }),
                  ZerospinError.catch({
                    code: 'self-hosted-generation-complete-rpc-failed',
                    message:
                      'SystemWorker failed to complete source generation cleanup',
                  }),
                ).pipe(Effect.flatMap(decodeRpc));
                if (
                  drained.deployId !== sourceDeploy.id ||
                  drained.generationId !== sourceDeploy.generationId ||
                  drained.admission !== 'drained'
                ) {
                  return yield* new ZerospinError({
                    code: 'self-hosted-generation-complete-result-invalid',
                    message:
                      'SystemWorker returned an invalid source cleanup result',
                    extra: {
                      expectedDeployId: sourceDeploy.id,
                      expectedGenerationId: sourceDeploy.generationId,
                      result: drained,
                    },
                  });
                }

                yield* Effect.try({
                  try: () =>
                    db.transaction(tx => {
                      const storedInstance = tx
                        .select()
                        .from(systemInstance)
                        .where(
                          eq(systemInstance.systemWorkerName, systemWorkerName),
                        )
                        .get();
                      if (storedInstance === undefined) {
                        throw new ZerospinError({
                          code: 'self-hosted-instance-not-found',
                          message:
                            'Self-hosted instance disappeared while clearing source cleanup',
                        });
                      }
                      const decodedInstance = Schema.decodeUnknownSync(
                        systemInstanceRowSchema,
                      )(storedInstance);
                      if (
                        decodedInstance.activeDeployId !== candidate.id ||
                        decodedInstance.activatingDeployId !== null ||
                        decodedInstance.transitionSourceDeployId !==
                          sourceDeploy.id
                      ) {
                        throw new ZerospinError({
                          code: 'self-hosted-transition-source-clear-conflict',
                          message:
                            'Self-hosted routing changed while source cleanup was completing',
                          extra: {
                            expectedActiveDeployId: candidate.id,
                            activeDeployId: decodedInstance.activeDeployId,
                            activatingDeployId:
                              decodedInstance.activatingDeployId,
                            expectedTransitionSourceDeployId: sourceDeploy.id,
                            transitionSourceDeployId:
                              decodedInstance.transitionSourceDeployId,
                          },
                        });
                      }
                      tx.update(systemInstance)
                        .set({ transitionSourceDeployId: null })
                        .where(
                          eq(systemInstance.systemWorkerName, systemWorkerName),
                        )
                        .run();
                    }),
                  catch: cause =>
                    ZerospinError.isZerospinError(cause)
                      ? cause
                      : new ZerospinError({
                          code: 'self-hosted-transition-source-clear-failed',
                          message:
                            'Failed to clear completed source cleanup state',
                          cause: ZerospinError.prettyUnknownFailure(cause),
                        }),
                });
              }).pipe(Effect.either);

              if (Either.isLeft(cleanup)) {
                yield* Effect.try({
                  try: () =>
                    db.transaction(tx => {
                      const eventIndexRow = tx
                        .select({
                          next: sql<number>`coalesce(max(${deployLog.eventIndex}), 0) + 1`.mapWith(
                            Number,
                          ),
                        })
                        .from(deployLog)
                        .get();
                      tx.insert(deployLog)
                        .values(
                          Schema.encodeUnknownSync(deployLogRowSchema)({
                            eventIndex: eventIndexRow?.next ?? 1,
                            systemWorkerName,
                            deployId: candidate.id,
                            generationId: candidate.generationId,
                            phase: 'complete',
                            level: 'warn',
                            message:
                              'Self-hosted deploy activated with pending source cleanup',
                            payload: ZerospinError.prettyUnknownFailure(
                              cleanup.left,
                            ),
                            createdAt: new Date(),
                          }),
                        )
                        .run();
                    }),
                  catch: () => cleanup.left,
                }).pipe(Effect.either);
              }
            }

            return new ZerospinApis({
              deployId: candidate.id,
              generationId: candidate.generationId,
              runtime,
            });
          }).pipe(
            Effect.catchAllCause(cause =>
              Effect.gen(function* () {
                // 12. Any terminal failure stays at its current phase, releases
                //     only this candidate's reservation, and remains permanently
                //     associated with workerVersionId.
                const squashed = Cause.squash(cause);
                const failure = ZerospinError.isZerospinError(squashed)
                  ? squashed
                  : new ZerospinError({
                      code: 'self-hosted-deploy-initialization-failed',
                      message: 'Self-hosted deploy initialization failed',
                      cause: ZerospinError.prettyUnknownFailure(squashed),
                    });
                const completedAt = yield* dutils.date();
                const encodedFailure = Schema.encodeUnknownSync(
                  ZerospinError.schema,
                )(failure);
                const persisted = yield* Effect.try({
                  try: () =>
                    db.transaction(tx => {
                      const storedCandidate = tx
                        .select()
                        .from(deploy)
                        .where(eq(deploy.id, candidate.id))
                        .get();
                      if (storedCandidate === undefined) {
                        throw new ZerospinError({
                          code: 'self-hosted-deploy-not-found',
                          message:
                            'Failed self-hosted deploy disappeared before failure persistence',
                          extra: { deployId: candidate.id },
                        });
                      }
                      const decodedCandidate =
                        Schema.decodeUnknownSync(deployRowSchema)(
                          storedCandidate,
                        );
                      if (decodedCandidate.status === 'succeeded') {
                        throw new ZerospinError({
                          code: 'self-hosted-succeeded-deploy-cannot-fail',
                          message:
                            'A succeeded self-hosted deploy cannot be changed to failed',
                          extra: { deployId: candidate.id },
                        });
                      }

                      const encodedFailedDeploy = Schema.encodeUnknownSync(
                        deployRowSchema,
                      )({
                        ...decodedCandidate,
                        status: 'failed',
                        completedAt,
                        failure: encodedFailure,
                      });
                      tx.update(deploy)
                        .set({
                          status: encodedFailedDeploy.status,
                          completedAt: encodedFailedDeploy.completedAt,
                          failure: encodedFailedDeploy.failure,
                        })
                        .where(eq(deploy.id, candidate.id))
                        .run();

                      const storedInstance = tx
                        .select()
                        .from(systemInstance)
                        .where(
                          eq(systemInstance.systemWorkerName, systemWorkerName),
                        )
                        .get();
                      if (storedInstance !== undefined) {
                        const decodedInstance = Schema.decodeUnknownSync(
                          systemInstanceRowSchema,
                        )(storedInstance);
                        if (
                          decodedInstance.activatingDeployId === candidate.id
                        ) {
                          tx.update(systemInstance)
                            .set({ activatingDeployId: null })
                            .where(
                              eq(
                                systemInstance.systemWorkerName,
                                systemWorkerName,
                              ),
                            )
                            .run();
                        }
                      }

                      const eventIndexRow = tx
                        .select({
                          next: sql<number>`coalesce(max(${deployLog.eventIndex}), 0) + 1`.mapWith(
                            Number,
                          ),
                        })
                        .from(deployLog)
                        .get();
                      const encodedLog = Schema.encodeUnknownSync(
                        deployLogRowSchema,
                      )({
                        eventIndex: eventIndexRow?.next ?? 1,
                        systemWorkerName,
                        deployId: candidate.id,
                        generationId: candidate.generationId,
                        phase: decodedCandidate.phase,
                        level: 'error',
                        message: failure.rawMessage,
                        payload: encodedFailure,
                        createdAt: completedAt,
                      });
                      tx.insert(deployLog).values(encodedLog).run();
                    }),
                  catch: cause =>
                    ZerospinError.isZerospinError(cause)
                      ? cause
                      : new ZerospinError({
                          code: 'self-hosted-deploy-failure-persist-failed',
                          message:
                            'Failed to persist the terminal self-hosted deploy failure',
                          cause: ZerospinError.prettyUnknownFailure(cause),
                        }),
                }).pipe(Effect.either);

                if (Either.isLeft(persisted)) {
                  return yield* new ZerospinError({
                    code: 'self-hosted-deploy-failure-persist-failed',
                    message:
                      'Self-hosted deploy initialization failed and its terminal state could not be persisted',
                    cause: `${failure.toString()}\nFailure persistence: ${persisted.left.toString()}`,
                    extra: { deployId: candidate.id, workerVersionId },
                  });
                }
                return yield* failure;
              }),
            ),
          );
        }),
      ),
    );

    // The constructor owns one readiness Promise. A passive observer prevents
    // early initialization failure from becoming an unhandled rejection before
    // Wrangler reaches the explicit readiness endpoint.
    void this.#apisReadiness.catch(() => undefined);
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const apis = await this.#apisReadiness;
      if (new URL(request.url).pathname === '/__zerospin/ready') {
        return new Response(null, { status: 204 });
      }
      return newWorkersRpcResponse(request, apis);
    } catch (error) {
      return new Response(ZerospinError.prettyUnknownFailure(error), {
        status: 500,
      });
    }
  }
}
