import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeEffectSchema } from '@zerospin/core/models/primitiveMaps';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import { checkSystemCompatibility } from '@zerospin/core/system/checkSystemCompatibility';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { cloudIdAbbreviations } from '@zerospin/core/utils/cloudIdAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { dutils } from '@zerospin/core/utils/dutils';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { ZerospinError } from '@zerospin/error';
import { newWorkersRpcResponse } from 'capnweb';
import type { env as cloudflareEnv } from 'cloudflare:workers';
import { eq, sql } from 'drizzle-orm';
import { Cause, Effect, Either, ManagedRuntime, Schema } from 'effect';
import { seeds } from 'seeds';
import { system } from 'system';
import { makeRepo } from 'system-worker/makeRepo/makeRepo';
import { makeRepoUtils } from 'system-worker/makeRepo/makeRepoUtils';

import { makeStaticApiKeyIdentityResolver } from '../ApiKeyIdentityResolver/makeStaticApiKeyIdentityResolver';
import { makeSystemWorkerName } from '../makeSystemWorkerName';
import {
  makeDispatchRuntime,
  type IDispatchRuntime,
} from '../makeDispatchRuntime';
import { SystemWorkerResolver } from '../SystemWorkerResolver/SystemWorkerResolver';
import { WorkerExportsSystemWorkerResolver } from '../SystemWorkerResolver/WorkerExportsSystemWorkerResolver';
import { ZerospinApis } from '../ZerospinApis/ZerospinApis';

const generationTable = makeTable({
  name: 'generation',
  shape: {
    id: primitives.primaryKey({
      abbreviation: cloudIdAbbreviations.generation,
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
      abbreviation: cloudIdAbbreviations.deploy,
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
      abbreviation: cloudIdAbbreviations.systemRecord,
    }),
    systemId: primitives.opaqueId({
      abbreviation: cloudIdAbbreviations.systemRecord,
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

const devZerospinApisRepoTables = {
  systemInstance: systemInstanceTable,
  generation: generationTable,
  deploy: deployTable,
  cleanRequest: cleanRequestTable,
  deployLog: deployLogTable,
};

const devZerospinApisDbConfig = makeDbConfig({
  tables: devZerospinApisRepoTables,
});
const systemInstanceRowSchema = makeEffectSchema(
  devZerospinApisRepoTables.systemInstance.shape,
);
const generationRowSchema = makeEffectSchema(
  devZerospinApisRepoTables.generation.shape,
);
const deployRowSchema = makeEffectSchema(
  devZerospinApisRepoTables.deploy.shape,
);
const cleanRequestRowSchema = makeEffectSchema(
  devZerospinApisRepoTables.cleanRequest.shape,
);
const deployLogRowSchema = makeEffectSchema(
  devZerospinApisRepoTables.deployLog.shape,
);

const devZerospinApisRepoUtils = makeRepoUtils({
  abbreviation: undefined,
  namePattern: RoutePattern.parse('/:systemWorkerName'),
  managedRuntime: ManagedRuntime.make(AsyncLive),
  getDbConfig: Effect.fn('DevZerospinApis.getDbConfig')(function* () {
    yield* Effect.void;
    return devZerospinApisDbConfig;
  }),
});

const DevZerospinApisRepo = makeRepo({
  repoUtils: devZerospinApisRepoUtils,
});

/**
 * Stable local deployment control and Cap'n Web readiness boundary.
 *
 * The Durable Object name is the stable `{systemId}:local` instance identity.
 * Wrangler supplies only that identity, one optional clean request, and Version
 * Metadata. This object allocates deploy/generation identities, persists every
 * state transition, and passes the selected identities explicitly to
 * SystemWorker lifecycle RPCs and the final ZerospinApis capability.
 */
export class DevZerospinApis extends DevZerospinApisRepo {
  readonly #apisReadiness: Promise<ZerospinApis>;
  readonly #runtime: IDispatchRuntime;

  constructor(
    ctx: ConstructorParameters<typeof DevZerospinApisRepo>[0],
    workerEnv: typeof cloudflareEnv,
  ) {
    super(ctx, workerEnv);

    const systemWorkerName = Schema.decodeUnknownSync(
      makeEffectSchema({
        systemWorkerName:
          devZerospinApisRepoTables.systemInstance.shape.systemWorkerName,
      }),
    )({
      systemWorkerName: makeSystemWorkerName({
        systemId: workerEnv.ZEROSPIN_SYSTEM_ID,
        instanceId: 'local',
      }),
    }).systemWorkerName;
    if (
      workerEnv.ZEROSPIN_INSTANCE_ID !== 'local' ||
      this.key.systemWorkerName !== systemWorkerName
    ) {
      throw new Error(
        'DevZerospinApis must be addressed by the exact {systemId}:local instance name',
      );
    }

    this.#runtime = makeDispatchRuntime({
      systemWorkerResolver: WorkerExportsSystemWorkerResolver,
      apiKeyIdentityResolver: makeStaticApiKeyIdentityResolver({
        systemId: workerEnv.ZEROSPIN_SYSTEM_ID,
        deployName: 'zerospin-dev',
        clerkUserId: 'local',
        keyType: 'secret',
      }),
    });

    const db = this.db;
    const {
      cleanRequest,
      deploy,
      deployLog,
      generation,
      systemInstance,
    } = this.schema;
    const runtime = this.#runtime;
    const workerVersionId = workerEnv.ZEROSPIN_VERSION_METADATA.id;

    this.#apisReadiness = this.repoInitialization.then(() =>
      runtime.runPromise(
        Effect.gen(function* () {
        // 1. Version Metadata is the only reload identity supplied by Wrangler.
        //    Deploy and generation ids are deliberately absent from local vars.
        if (workerVersionId.length === 0) {
          return yield* new ZerospinError({
            code: 'local-worker-version-id-missing',
            message: 'ZEROSPIN_VERSION_METADATA.id must be non-empty',
          });
        }

        const currentSystemSpec = yield* Effect.try({
          try: () => makeSystemSpec({ system }),
          catch: ZerospinError.catch({
            code: 'local-system-spec-build-failed',
            message: 'Failed to build the current local SystemSpec',
          }),
        });

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
            code: 'local-deploy-read-failed',
            message: 'Failed to read the local Worker-version deploy mapping',
          }),
        });

        if (existingDeploy !== null) {
          if (existingDeploy.systemWorkerName !== systemWorkerName) {
            return yield* new ZerospinError({
              code: 'local-worker-version-instance-conflict',
              message:
                'The local Worker version is already mapped to another system instance',
              extra: {
                workerVersionId,
                storedSystemWorkerName: existingDeploy.systemWorkerName,
                requestedSystemWorkerName: systemWorkerName,
              },
            });
          }
          if (existingDeploy.status === 'running') {
            return yield* new ZerospinError({
              code: 'local-deploy-interrupted',
              message:
                'This Worker version has an interrupted local deploy; change the code or start a new clean process',
              extra: {
                deployId: existingDeploy.id,
                phase: existingDeploy.phase,
                workerVersionId,
              },
            });
          }
          if (existingDeploy.status === 'failed') {
            return yield* new ZerospinError({
              code: 'local-deploy-previously-failed',
              message:
                'This Worker version previously failed local initialization',
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
              code: 'local-succeeded-deploy-incomplete',
              message:
                'A succeeded local deploy must be in the complete phase',
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
                .where(
                  eq(systemInstance.systemWorkerName, systemWorkerName),
                )
                .get();
              return storedInstance === undefined
                ? null
                : Schema.decodeUnknownSync(systemInstanceRowSchema)(
                    storedInstance,
                  );
            },
            catch: ZerospinError.catch({
              code: 'local-instance-read-failed',
              message: 'Failed to read the local system instance',
            }),
          });
          if (
            existingInstance === null ||
            existingInstance.systemId !== workerEnv.ZEROSPIN_SYSTEM_ID ||
            existingInstance.instanceId !== 'local' ||
            existingInstance.activeDeployId !== existingDeploy.id ||
            existingInstance.activatingDeployId !== null
          ) {
            return yield* new ZerospinError({
              code: 'local-active-deploy-mismatch',
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
                .where(
                  eq(systemInstance.systemWorkerName, systemWorkerName),
                )
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
                instance.instanceId !== 'local'
              ) {
                throw new ZerospinError({
                  code: 'local-instance-identity-conflict',
                  message:
                    'Stored local instance identity does not match its Durable Object name',
                  extra: {
                    systemWorkerName,
                    storedSystemId: instance.systemId,
                    storedInstanceId: instance.instanceId,
                  },
                });
              }
              if (instance.activatingDeployId !== null) {
                throw new ZerospinError({
                  code: 'local-activation-interrupted',
                  message:
                    'A prior local deploy still owns the activation reservation',
                  extra: {
                    activatingDeployId: instance.activatingDeployId,
                  },
                });
              }
              if (instance.activeDeployId === null) {
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
                  code: 'local-active-deploy-not-found',
                  message: 'The local activeDeployId has no deploy row',
                  extra: { activeDeployId: instance.activeDeployId },
                });
              }
              const activeDeploy = Schema.decodeUnknownSync(deployRowSchema)(
                storedActiveDeploy,
              );
              if (
                activeDeploy.systemWorkerName !== systemWorkerName ||
                activeDeploy.status !== 'succeeded' ||
                activeDeploy.phase !== 'complete'
              ) {
                throw new ZerospinError({
                  code: 'local-active-deploy-invalid',
                  message:
                    'The local active deploy is not a succeeded complete deploy for this instance',
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
                  code: 'local-active-state-read-failed',
                  message: 'Failed to read local active deployment state',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
        });

        const cleanRequestId =
          workerEnv.ZEROSPIN_CLEAN_REQUEST_ID === undefined
            ? undefined
            : Schema.decodeUnknownSync(
                makeEffectSchema({
                  id: devZerospinApisRepoTables.cleanRequest.shape.id,
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
                code: 'local-clean-request-deploy-not-found',
                message: 'The consumed clean request has no selected deploy',
                extra: {
                  cleanRequestId,
                  deployId: decodedCleanRequest.deployId,
                },
              });
            }
            const decodedSelectedDeploy = Schema.decodeUnknownSync(
              deployRowSchema,
            )(selectedDeploy);
            if (
              decodedSelectedDeploy.generationId !==
              decodedCleanRequest.generationId
            ) {
              throw new ZerospinError({
                code: 'local-clean-request-generation-mismatch',
                message:
                  'The consumed clean request does not match its selected deploy generation',
                extra: {
                  cleanRequestId,
                  deployId: decodedCleanRequest.deployId,
                  cleanRequestGenerationId:
                    decodedCleanRequest.generationId,
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
                  code: 'local-clean-request-read-failed',
                  message: 'Failed to read the local clean request receipt',
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
        const deployId = yield* makeIdFromAbbreviation({
          abbreviation: cloudIdAbbreviations.deploy,
        });
        const generationId = createsGeneration
          ? yield* makeIdFromAbbreviation({
              abbreviation: cloudIdAbbreviations.generation,
            })
          : activeState.activeDeploy === null
            ? yield* new ZerospinError({
                code: 'local-reused-generation-missing',
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
                .where(
                  eq(systemInstance.systemWorkerName, systemWorkerName),
                )
                .get();

              if (currentStoredInstance === undefined) {
                const encodedInstance = Schema.encodeUnknownSync(
                  systemInstanceRowSchema,
                )({
                  systemWorkerName,
                  systemId: workerEnv.ZEROSPIN_SYSTEM_ID,
                  instanceId: 'local',
                  activeDeployId: null,
                  activatingDeployId: null,
                });
                tx.insert(systemInstance).values(encodedInstance).run();
              } else {
                const currentInstance = Schema.decodeUnknownSync(
                  systemInstanceRowSchema,
                )(currentStoredInstance);
                if (
                  currentInstance.activeDeployId !==
                    activeState.instance?.activeDeployId ||
                  currentInstance.activatingDeployId !== null
                ) {
                  throw new ZerospinError({
                    code: 'local-deploy-allocation-stale',
                    message:
                      'Local active deployment state changed before candidate allocation',
                    extra: {
                      expectedActiveDeployId:
                        activeState.instance?.activeDeployId ?? null,
                      activeDeployId: currentInstance.activeDeployId,
                      activatingDeployId:
                        currentInstance.activatingDeployId,
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
                    code: 'local-generation-id-conflict',
                    message:
                      'The newly allocated local generationId already exists',
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
                    code: 'local-reused-generation-not-found',
                    message: 'The selected reused generation does not exist',
                    extra: { generationId },
                  });
                }
                const decodedGeneration = Schema.decodeUnknownSync(
                  generationRowSchema,
                )(storedGeneration);
                if (
                  activeState.activeDeploy?.generationId !==
                    decodedGeneration.id ||
                  decodedGeneration.id !== generationId
                ) {
                  throw new ZerospinError({
                    code: 'local-inactive-generation-reuse',
                    message:
                      'Only the active local generation may be reused',
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
                    code: 'local-clean-request-already-consumed',
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
              const encodedLog = Schema.encodeUnknownSync(
                deployLogRowSchema,
              )({
                eventIndex: eventIndexRow?.next ?? 1,
                systemWorkerName,
                deployId,
                generationId,
                phase: 'checking',
                level: 'info',
                message: 'Local deploy candidate allocated',
                payload:
                  compatibility === null
                    ? {
                        cleanRequestId: isClean ? cleanRequestId : null,
                        initial: activeState.activeDeploy === null,
                      }
                    : compatibility,
                createdAt: startedAt,
              });
              tx.insert(deployLog).values(encodedLog).run();
              return Schema.decodeUnknownSync(deployRowSchema)(
                encodedCandidate,
              );
            }),
          catch: cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'local-deploy-allocation-failed',
                  message: 'Failed to allocate the local deploy candidate',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                  extra: { workerVersionId, systemWorkerName },
                }),
        });

        return yield* Effect.gen(function* () {
          // 6. Missing adapter coverage is a recorded checking failure. Dev
          //    waives SemVer floors, but never waives data compatibility.
          if (
            compatibility !== null &&
            compatibility.missingAdapters.length > 0
          ) {
            return yield* new ZerospinError({
              code: 'local-system-incompatible',
              message:
                'The local system changed incompatibly; add the reported mutation adapters or rerun zerospin dev --clean',
              extra: {
                requiredBump: compatibility.requiredBump,
                diffs: compatibility.diffs,
                missingAdapters: compatibility.missingAdapters,
              },
            });
          }

          const resolver = yield* SystemWorkerResolver;
          using systemWorker = resolver.get({ systemWorkerName });

          // 7. Local drain is inspection-only and occurs only before replaying
          //    an ordinary migration into a new generation. Exact reuse,
          //    initial roots, and explicit clean roots deliberately skip it.
          if (
            activeState.activeDeploy !== null &&
            !isClean &&
            createsGeneration
          ) {
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
                      code: 'local-deploy-not-found',
                      message:
                        'Local deploy disappeared before drain inspection',
                      extra: { deployId: candidate.id },
                    });
                  }
                  const decodedCandidate = Schema.decodeUnknownSync(
                    deployRowSchema,
                  )(storedCandidate);
                  if (
                    decodedCandidate.status !== 'running' ||
                    decodedCandidate.phase !== 'checking'
                  ) {
                    throw new ZerospinError({
                      code: 'local-deploy-phase-conflict',
                      message:
                        'Only a running checking deploy may enter draining',
                      extra: {
                        deployId: candidate.id,
                        status: decodedCandidate.status,
                        phase: decodedCandidate.phase,
                      },
                    });
                  }
                  tx.update(deploy)
                    .set({ phase: 'draining' })
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
                    phase: 'draining',
                    level: 'info',
                    message:
                      'Inspecting the prior generation before local migration',
                    payload: {
                      priorDeployId: activeState.activeDeploy.id,
                      priorGenerationId:
                        activeState.activeDeploy.generationId,
                    },
                    createdAt: drainingAt,
                  });
                  tx.insert(deployLog).values(encodedLog).run();
                }),
              catch: cause =>
                ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'local-deploy-draining-transition-failed',
                      message:
                        'Failed to persist the local draining transition',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
            });

            const drained = yield* makeAsync(
              () =>
                systemWorker.drainGeneration({
                  deployId: activeState.activeDeploy.id,
                  generationId: activeState.activeDeploy.generationId,
                }),
              ZerospinError.catch({
                code: 'local-generation-drain-rpc-failed',
                message:
                  'SystemWorker failed to inspect the prior local generation',
              }),
            ).pipe(Effect.flatMap(decodeRpc));
            if (
              drained.deployId !== activeState.activeDeploy.id ||
              drained.generationId !== activeState.activeDeploy.generationId ||
              drained.admission !== 'drained'
            ) {
              return yield* new ZerospinError({
                code: 'local-generation-drain-result-invalid',
                message:
                  'SystemWorker returned an invalid local drain result',
                extra: {
                  expectedDeployId: activeState.activeDeploy.id,
                  expectedGenerationId:
                    activeState.activeDeploy.generationId,
                  result: drained,
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
                    code: 'local-deploy-not-found',
                    message:
                      'Local deploy disappeared before generation preparation',
                    extra: { deployId: candidate.id },
                  });
                }
                const decodedCandidate = Schema.decodeUnknownSync(
                  deployRowSchema,
                )(storedCandidate);
                if (
                  decodedCandidate.status !== 'running' ||
                  (decodedCandidate.phase !== 'checking' &&
                    decodedCandidate.phase !== 'draining')
                ) {
                  throw new ZerospinError({
                    code: 'local-deploy-phase-conflict',
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
                  message: 'Preparing the selected local generation',
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
                    code: 'local-deploy-preparing-transition-failed',
                    message:
                      'Failed to persist the local preparing transition',
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
              code: 'local-generation-prepare-rpc-failed',
              message: 'SystemWorker failed to prepare the local generation',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          if (
            prepared.deployId !== candidate.id ||
            prepared.generationId !== candidate.generationId ||
            prepared.readiness !== 'ready' ||
            prepared.reusedGeneration !== !createsGeneration
          ) {
            return yield* new ZerospinError({
              code: 'local-generation-prepare-result-invalid',
              message:
                'SystemWorker returned an invalid local preparation result',
              extra: {
                expectedDeployId: candidate.id,
                expectedGenerationId: candidate.generationId,
                expectedReusedGeneration: !createsGeneration,
                result: prepared,
              },
            });
          }

          // 9. Reserve activation with a local compare-and-swap before opening
          //    the generation. The stable active pointer does not move yet.
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
                    code: 'local-activation-state-not-found',
                    message:
                      'Local deploy or instance disappeared before activation reservation',
                    extra: { deployId: candidate.id, systemWorkerName },
                  });
                }
                const decodedCandidate = Schema.decodeUnknownSync(
                  deployRowSchema,
                )(storedCandidate);
                const decodedInstance = Schema.decodeUnknownSync(
                  systemInstanceRowSchema,
                )(storedInstance);
                if (
                  decodedCandidate.status !== 'running' ||
                  decodedCandidate.phase !== 'preparing'
                ) {
                  throw new ZerospinError({
                    code: 'local-deploy-not-ready-for-activation',
                    message:
                      'Only a running prepared deploy may reserve local activation',
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
                    code: 'local-stale-deploy-activation',
                    message:
                      'The active local deploy changed after candidate allocation',
                    extra: {
                      deployId: candidate.id,
                      prevDeployId: decodedCandidate.prevDeployId,
                      activeDeployId: decodedInstance.activeDeployId,
                    },
                  });
                }
                if (decodedInstance.activatingDeployId !== null) {
                  throw new ZerospinError({
                    code: 'local-concurrent-deploy-activation',
                    message:
                      'Another local deploy already owns the activation reservation',
                    extra: {
                      deployId: candidate.id,
                      activatingDeployId:
                        decodedInstance.activatingDeployId,
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
                  message: 'Reserved local deploy activation',
                  payload: { prevDeployId: decodedCandidate.prevDeployId },
                  createdAt: activatingAt,
                });
                tx.insert(deployLog).values(encodedLog).run();
              }),
            catch: cause =>
              ZerospinError.isZerospinError(cause)
                ? cause
                : new ZerospinError({
                    code: 'local-deploy-activation-reservation-failed',
                    message:
                      'Failed to reserve local deploy activation',
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
              code: 'local-generation-open-rpc-failed',
              message: 'SystemWorker failed to open the local generation',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          if (
            opened.deployId !== candidate.id ||
            opened.generationId !== candidate.generationId ||
            opened.workerVersionId !== workerVersionId
          ) {
            return yield* new ZerospinError({
              code: 'local-generation-open-result-invalid',
              message: 'SystemWorker returned an invalid local open result',
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
                    code: 'local-activation-state-not-found',
                    message:
                      'Local deploy or instance disappeared before final promotion',
                    extra: { deployId: candidate.id, systemWorkerName },
                  });
                }
                const decodedCandidate = Schema.decodeUnknownSync(
                  deployRowSchema,
                )(storedCandidate);
                const decodedInstance = Schema.decodeUnknownSync(
                  systemInstanceRowSchema,
                )(storedInstance);
                if (
                  decodedCandidate.status !== 'running' ||
                  decodedCandidate.phase !== 'activating' ||
                  decodedInstance.activeDeployId !==
                    decodedCandidate.prevDeployId ||
                  decodedInstance.activatingDeployId !== candidate.id
                ) {
                  throw new ZerospinError({
                    code: 'local-deploy-activation-reservation-lost',
                    message:
                      'Final local promotion requires the original predecessor and reservation',
                    extra: {
                      deployId: candidate.id,
                      status: decodedCandidate.status,
                      phase: decodedCandidate.phase,
                      prevDeployId: decodedCandidate.prevDeployId,
                      activeDeployId: decodedInstance.activeDeployId,
                      activatingDeployId:
                        decodedInstance.activatingDeployId,
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
                    workerVersionId:
                      encodedCompletedDeploy.workerVersionId,
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
                  message: 'Local deploy activated',
                  payload: { workerVersionId },
                  createdAt: completedAt,
                });
                tx.insert(deployLog).values(encodedLog).run();
              }),
            catch: cause =>
              ZerospinError.isZerospinError(cause)
                ? cause
                : new ZerospinError({
                    code: 'local-deploy-promotion-failed',
                    message: 'Failed to promote the local deploy',
                    cause: ZerospinError.prettyUnknownFailure(cause),
                  }),
          });

          return new ZerospinApis({
            deployId: candidate.id,
            generationId: candidate.generationId,
            runtime,
          });
        }).pipe(
          Effect.catchAllCause(cause =>
            Effect.gen(function* () {
              // 11. Any terminal failure stays at its current phase, releases
              //     only this candidate's reservation, and remains permanently
              //     associated with workerVersionId.
              const squashed = Cause.squash(cause);
              const failure = ZerospinError.isZerospinError(squashed)
                ? squashed
                : new ZerospinError({
                    code: 'local-deploy-initialization-failed',
                    message: 'Local deploy initialization failed',
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
                        code: 'local-deploy-not-found',
                        message:
                          'Failed local deploy disappeared before failure persistence',
                        extra: { deployId: candidate.id },
                      });
                    }
                    const decodedCandidate = Schema.decodeUnknownSync(
                      deployRowSchema,
                    )(storedCandidate);
                    if (decodedCandidate.status === 'succeeded') {
                      throw new ZerospinError({
                        code: 'local-succeeded-deploy-cannot-fail',
                        message:
                          'A succeeded local deploy cannot be changed to failed',
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
                        eq(
                          systemInstance.systemWorkerName,
                          systemWorkerName,
                        ),
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
                        code: 'local-deploy-failure-persist-failed',
                        message:
                          'Failed to persist the terminal local deploy failure',
                        cause: ZerospinError.prettyUnknownFailure(cause),
                      }),
              }).pipe(Effect.either);

              if (Either.isLeft(persisted)) {
                return yield* new ZerospinError({
                  code: 'local-deploy-failure-persist-failed',
                  message:
                    'Local deploy initialization failed and its terminal state could not be persisted',
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
