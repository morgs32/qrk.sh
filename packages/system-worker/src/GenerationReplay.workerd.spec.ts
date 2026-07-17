/*
 * Generation replay acceptance coverage:
 *
 * 1. Drive the real prepareGeneration migration branch from a drained source.
 * 2. Preserve authoritative blocks, receipts, resource state, and watermarks.
 * 3. Rebuild AuthorizationRepo, ActorRepo, and FrontendRepo only on demand.
 * 4. Deliver only service blocks published after the restored watermark.
 * 5. Resume one interrupted same-deploy preparation from persisted receipts.
 * 6. Permanently fail adapter, target constraint, topology, and count violations.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { TraceLoggerLayer } from '@zerospin/core/test-utils/TraceLoggerLayer';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import {
  makeTelemetryCollector,
  makeTraceableRpcTarget,
  TelemetryCollector,
} from '@zerospin/logger';
import { env, runInDurableObject } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { Effect, Layer, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { getAccountBlockRepo } from './AccountBlockRepo/getAccountBlockRepo/getAccountBlockRepo.js';
import { AccountRepo } from './AccountRepo/AccountRepo.js';
import { getAccountRepo } from './AccountRepo/getAccountRepo/getAccountRepo.js';
import { getActorRepo } from './ActorRepo/getActorRepo/getActorRepo.js';
import { AuthorizationRepo } from './AuthorizationRepo/AuthorizationRepo.js';
import { getAuthorizationRepo } from './AuthorizationRepo/getAuthorizationRepo/getAuthorizationRepo.js';
import { ServiceBlockSchema } from './blockSchemas.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { main, mainModels, system, userAccount } from './fixtures/system.js';
import { getFrontendRepo } from './FrontendRepo/getFrontendRepo/getFrontendRepo.js';
import { managedRuntime } from './managedRuntime.js';
import { openGeneration } from './openGeneration/openGeneration.js';
import { prepareGeneration } from './prepareGeneration/prepareGeneration.js';
import { getServiceBlockRepo } from './ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { ServiceBlockRepo } from './ServiceBlockRepo/ServiceBlockRepo.js';
import { getServiceRepo } from './ServiceRepo/getServiceRepo/getServiceRepo.js';
import { ServiceRepo } from './ServiceRepo/ServiceRepo.js';
import { SystemRepo } from './SystemRepo/SystemRepo.js';
import { executeInRepo } from './workerd-utils/executeInRepo.js';

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('GenerationReplay'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

/*
 * The workerd fixture runs one current Worker version. A real predecessor was
 * prepared by earlier code, so this setup persists one prior non-unique index
 * after draining. The current Worker then observes a legitimate model-definition
 * change while replaying the exact ledgers built below.
 */
const prepareReplaySource = Effect.fn('GenerationReplay.prepareReplaySource')(
  function* (props: { suffix: string; createDerivedRepos: boolean }) {
    const { createDerivedRepos, suffix } = props;
    const prevGenerationId = `gen_generation_replay_source_${suffix}`;
    const sourceDeployId = `dpl_generation_replay_source_${suffix}`;
    const accountId = makeAccountId({ id: `generation-replay-${suffix}` });
    const actorId = yield* makeIdFromAbbreviation({ abbreviation: 'actr' });
    const userId = yield* makeIdFromAbbreviation({
      abbreviation: mainModels.user.abbreviation,
    });
    const productId = yield* makeIdFromAbbreviation({
      abbreviation: mainModels.product.abbreviation,
    });
    const systemSpec = makeSystemSpec({ system });

    // 1. Establish an ordinary active source before any authoritative writes.
    yield* prepareGeneration({
      deployId: sourceDeployId,
      generationId: prevGenerationId,
      prevGenerationId: null,
      systemSpec,
      seeds: [],
    });
    yield* openGeneration({
      deployId: sourceDeployId,
      generationId: prevGenerationId,
    });

    // 2. Create one service block and one account block that permanently joins
    //    this account to the app service at the first service watermark.
    const sourceServiceRepo = yield* getServiceRepo({
      key: { generationId: prevGenerationId, serviceName: 'app' },
    });
    const sourceServiceResult = yield* makeAsync(() =>
      sourceServiceRepo.finalizeServiceCommands({
        serviceName: 'app',
        commands: [
          {
            id: `cmd_generation_replay_create_${suffix}`,
            commandName: 'createProduct',
            payload: {
              id: productId,
              name: `Generation replay product ${suffix}`,
            },
            version: '1.0.0',
            systemVersion: system.version,
            commandType: 'service',
            serviceName: 'app',
          },
        ],
      }),
    ).pipe(Effect.flatMap(decodeRpc));
    if (sourceServiceResult.failedCommands.length !== 0) {
      return yield* Effect.die(
        new Error('Expected the source service command to succeed'),
      );
    }
    yield* makeAsync(() => sourceServiceRepo.drainServiceBlockOutbox()).pipe(
      Effect.flatMap(decodeRpc),
    );

    const sourceProduct = yield* Effect.promise(() =>
      executeInRepo({
        managedRuntime,
        getRepo: getServiceRepo,
        repo: ServiceRepo,
        key: { generationId: prevGenerationId, serviceName: 'app' },
        fn: ({ db, schema }) =>
          db
            .select()
            .from(schema.product)
            .where(eq(schema.product.id, productId))
            .get(),
      }),
    );
    if (sourceProduct === undefined) {
      return yield* Effect.die(
        new Error('Expected the source product after service finalization'),
      );
    }

    const sourceAccountRepo = yield* getAccountRepo({
      key: {
        generationId: prevGenerationId,
        accountId,
        accountName: main.accountName,
      },
    });
    const replicateCommand = yield* userAccount.makeCommand({
      contractName: 'replicateProduct',
      accountId,
      systemName: main.systemName,
      systemVersion: system.version,
      payload: { product: sourceProduct },
    });
    const sourceAccountBlock = yield* makeTraceableRpcTarget<
      Pick<AccountRepo, 'finalizeAccountBlock'>
    >(sourceAccountRepo)
      .finalizeAccountBlock({
        accountId,
        accountName: main.accountName,
        commands: [replicateCommand],
      })
      .pipe(
        Effect.provideService(TelemetryCollector, makeTelemetryCollector()),
        Effect.catchAll(error => Effect.die(error)),
      );
    if (
      sourceAccountBlock.failure !== null ||
      sourceAccountBlock.failedCommands.length !== 0
    ) {
      return yield* Effect.die(
        new Error('Expected the source account command to succeed'),
      );
    }
    yield* makeAsync(() => sourceAccountRepo.drainAccountOutboxes()).pipe(
      Effect.flatMap(decodeRpc),
    );

    // 3. Derived repos deliberately contain source-generation state. Migration
    //    must not replay any of it into the target generation.
    if (createDerivedRepos) {
      yield* Effect.promise(() =>
        executeInRepo({
          managedRuntime,
          getRepo: getAuthorizationRepo,
          repo: AuthorizationRepo,
          key: {
            generationId: prevGenerationId,
            accountId,
            accountName: main.accountName,
          },
          fn: ({ db, schema }) => {
            const now = new Date(0);
            db.insert(schema.user)
              .values({
                id: userId,
                actorId,
                modelName: 'user',
                name: `Source authorization user ${suffix}`,
                version: '1.0.0',
                createdAt: now,
                updatedAt: now,
              })
              .run();
          },
        }),
      );
      const sourceAuthorizationRepo = yield* getAuthorizationRepo({
        key: {
          generationId: prevGenerationId,
          accountId,
          accountName: main.accountName,
        },
      });
      yield* makeAsync(() =>
        sourceAuthorizationRepo.authorize({
          actor: { actorId, accountId },
          accountName: main.accountName,
          actorName: main.actorName,
          frontendName: main.frontendName,
        }),
      ).pipe(Effect.flatMap(decodeRpc));

      const sourceActorRepo = yield* getActorRepo({
        key: {
          generationId: prevGenerationId,
          accountId,
          accountName: main.accountName,
          actorName: main.actorName,
          actorId,
        },
      });
      yield* makeAsync(() =>
        sourceActorRepo.dumpActorModelResources({
          accountName: main.accountName,
          actorName: main.actorName,
          modelName: 'product',
        }),
      ).pipe(Effect.flatMap(decodeRpc));

      const sourceFrontendRepo = yield* getFrontendRepo({
        key: {
          generationId: prevGenerationId,
          accountId,
          accountName: main.accountName,
          actorName: main.actorName,
          actorId,
          frontendName: main.frontendName,
        },
      });
      yield* makeAsync(() =>
        sourceFrontendRepo.getFrontendState({
          accountId,
          accountName: main.accountName,
          actorId,
          actorName: main.actorName,
          frontendName: main.frontendName,
          systemWorkerName: 'system-worker-generation-replay-source',
        }),
      ).pipe(Effect.flatMap(decodeRpc));
    }

    // 4. Drain closes admission, empties every outbox, and captures immutable
    //    ServiceBlockRepo and AccountBlockRepo replay bounds.
    yield* drainGeneration({
      deployId: sourceDeployId,
      generationId: prevGenerationId,
    });
    const sourceSystemRepo = SystemRepo.getRepo({
      generationId: prevGenerationId,
    });
    const sourceState = yield* makeAsync(() =>
      sourceSystemRepo.getGenerationState(),
    ).pipe(Effect.flatMap(decodeRpc));
    if (sourceState === null || sourceState.admission !== 'drained') {
      return yield* Effect.die(
        new Error('Expected the source generation to be drained'),
      );
    }

    const sourceServiceBlockRepo = yield* getServiceBlockRepo({
      key: { generationId: prevGenerationId, serviceName: 'app' },
    });
    const sourceServiceBound = yield* makeAsync(() =>
      sourceServiceBlockRepo.getReplayBound(),
    ).pipe(Effect.flatMap(decodeRpc));
    if (sourceServiceBound.serviceIndex === null) {
      return yield* Effect.die(
        new Error('Expected a source service replay bound'),
      );
    }
    const sourceServiceBlock = yield* makeAsync(() =>
      sourceServiceBlockRepo.getReplayBlock({
        afterServiceIndex: null,
        throughServiceIndex: sourceServiceBound.serviceIndex,
      }),
    ).pipe(Effect.flatMap(decodeRpc));
    if (sourceServiceBlock === null) {
      return yield* Effect.die(new Error('Expected a source service block'));
    }

    const sourceAccountBlockRepo = yield* getAccountBlockRepo({
      key: {
        generationId: prevGenerationId,
        accountId,
        accountName: main.accountName,
      },
    });
    const sourceAccountBound = yield* makeAsync(() =>
      sourceAccountBlockRepo.getReplayBound(),
    ).pipe(Effect.flatMap(decodeRpc));
    if (sourceAccountBound.accountIndex === null) {
      return yield* Effect.die(
        new Error('Expected a source account replay bound'),
      );
    }
    const sourceReplayAccountBlock = yield* makeAsync(() =>
      sourceAccountBlockRepo.getReplayBlock({
        afterAccountIndex: null,
        throughAccountIndex: sourceAccountBound.accountIndex,
      }),
    ).pipe(Effect.flatMap(decodeRpc));
    if (sourceReplayAccountBlock === null) {
      return yield* Effect.die(new Error('Expected a source account block'));
    }
    const sourceSubscriptions = yield* makeAsync(() =>
      sourceAccountRepo.getReplaySubscriptions(),
    ).pipe(Effect.flatMap(decodeRpc));
    const sourceSubscription = sourceSubscriptions[0];
    if (sourceSubscription === undefined) {
      return yield* Effect.die(
        new Error('Expected the source service subscription'),
      );
    }

    // 5. Persist the model definition accepted by the hypothetical older
    //    Worker. Removing this prior index is compatible, but still requires a
    //    new generation because encoded model definitions changed.
    const priorSystemSpec = structuredClone(systemSpec);
    const priorAppService = priorSystemSpec.serviceControllers.app;
    const priorProduct = priorAppService?.models.product;
    if (priorProduct === undefined) {
      return yield* Effect.die(
        new Error('Expected the app Product model in SystemSpec'),
      );
    }
    priorProduct.indexes = [
      {
        name: `prior_product_name_${suffix}`,
        columns: ['name'],
        unique: false,
      },
    ];
    const encodedPriorSystemSpec = Schema.encodeUnknownSync(
      Schema.parseJson(SystemSpecSchema),
    )(priorSystemSpec);
    yield* Effect.promise(() =>
      runInDurableObject(
        env.SYSTEM_REPO.getByName(`sysrepo_${prevGenerationId}`),
        (_instance, state) => {
          state.storage.sql.exec(
            'UPDATE generationState SET activeSystemSpec = ? WHERE generationId = ?',
            encodedPriorSystemSpec,
            prevGenerationId,
          );
        },
      ),
    );

    return {
      accountId,
      actorId,
      encodedPriorSystemSpec,
      prevGenerationId,
      productId,
      sourceAccountBlock: sourceReplayAccountBlock,
      sourceAccountBound,
      sourceProduct,
      sourceServiceBlock,
      sourceServiceBound,
      sourceSubscription,
      sourceSystemRepo,
      systemSpec,
      userId,
    };
  },
);

const readGenerationState = Effect.fn('GenerationReplay.readGenerationState')(
  function* (props: { generationId: string }) {
    return yield* makeAsync(() =>
      SystemRepo.getRepo({
        generationId: props.generationId,
      }).getGenerationState(),
    ).pipe(Effect.flatMap(decodeRpc));
  },
);

describe('generation replay', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'prepares a migrated generation, rebuilds derived repos, and fans out only future service blocks',
      () =>
        Effect.gen(function* () {
          const source = yield* prepareReplaySource({
            suffix: 'acceptance',
            createDerivedRepos: true,
          });
          const targetGenerationId = 'gen_generation_replay_target_acceptance';
          const targetDeployId = 'dpl_generation_replay_target_acceptance';

          // 1. The source really contains derived repos before migration.
          const sourceAuthorizations = yield* makeAsync(() =>
            source.sourceSystemRepo.getRepoRegistrations({
              repoType: 'AuthorizationRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const sourceActors = yield* makeAsync(() =>
            source.sourceSystemRepo.getRepoRegistrations({
              repoType: 'ActorRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const sourceFrontends = yield* makeAsync(() =>
            source.sourceSystemRepo.getRepoRegistrations({
              repoType: 'FrontendRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(sourceAuthorizations).toHaveLength(1);
          expect(sourceActors).toHaveLength(1);
          expect(sourceFrontends).toHaveLength(1);

          // 2. prepareGeneration owns the complete service-first/account-second
          //    migration and reports readiness only after every receipt exists.
          const prepared = yield* prepareGeneration({
            deployId: targetDeployId,
            generationId: targetGenerationId,
            prevGenerationId: source.prevGenerationId,
            systemSpec: source.systemSpec,
            seeds: [],
          });
          expect(prepared).toEqual({
            deployId: targetDeployId,
            generationId: targetGenerationId,
            readiness: 'ready',
            reusedGeneration: false,
          });
          const targetState = yield* readGenerationState({
            generationId: targetGenerationId,
          });
          expect(targetState).toMatchObject({
            generationId: targetGenerationId,
            prevGenerationId: source.prevGenerationId,
            initialDeployId: targetDeployId,
            readiness: 'ready',
            admission: 'closed',
          });
          expect(targetState?.replayCompletions).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                repoType: 'ServiceRepo',
                blockCount: 1,
              }),
              expect.objectContaining({
                repoType: 'AccountRepo',
                blockCount: 1,
              }),
            ]),
          );

          // 3. Only authoritative data-owner repos exist immediately after
          //    replay. Source Authorization/Actor/Frontend state was not copied.
          const targetSystemRepo = SystemRepo.getRepo({
            generationId: targetGenerationId,
          });
          const targetServiceRepos = yield* makeAsync(() =>
            targetSystemRepo.getRepoRegistrations({ repoType: 'ServiceRepo' }),
          ).pipe(Effect.flatMap(decodeRpc));
          const targetAccountRepos = yield* makeAsync(() =>
            targetSystemRepo.getRepoRegistrations({ repoType: 'AccountRepo' }),
          ).pipe(Effect.flatMap(decodeRpc));
          const targetAuthorizationsBefore = yield* makeAsync(() =>
            targetSystemRepo.getRepoRegistrations({
              repoType: 'AuthorizationRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const targetActorsBefore = yield* makeAsync(() =>
            targetSystemRepo.getRepoRegistrations({ repoType: 'ActorRepo' }),
          ).pipe(Effect.flatMap(decodeRpc));
          const targetFrontendsBefore = yield* makeAsync(() =>
            targetSystemRepo.getRepoRegistrations({ repoType: 'FrontendRepo' }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(targetServiceRepos).toHaveLength(1);
          expect(targetAccountRepos).toHaveLength(1);
          expect(targetAuthorizationsBefore).toEqual([]);
          expect(targetActorsBefore).toEqual([]);
          expect(targetFrontendsBefore).toEqual([]);

          const targetAccountStateBefore = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: targetGenerationId,
                accountId: source.accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) => ({
                product: db
                  .select()
                  .from(schema.product)
                  .where(eq(schema.product.id, source.productId))
                  .get(),
                receipts: db.select().from(schema.accountReplayReceipts).all(),
                subscriptions: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .all(),
              }),
            }),
          );
          expect(targetAccountStateBefore.product).toEqual(
            expect.objectContaining({
              id: source.productId,
              name: source.sourceProduct.name,
            }),
          );
          expect(targetAccountStateBefore.receipts).toHaveLength(1);
          expect(targetAccountStateBefore.subscriptions).toEqual([
            expect.objectContaining({
              currentServiceCursor:
                source.sourceSubscription.currentServiceCursor,
              currentServiceIndex:
                source.sourceSubscription.currentServiceIndex,
              failure: null,
              subscribedAt: expect.any(Date),
            }),
          ]);

          const targetServiceState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceRepo,
              repo: ServiceRepo,
              key: { generationId: targetGenerationId, serviceName: 'app' },
              fn: ({ db, schema }) => ({
                receipts: db.select().from(schema.serviceReplayReceipts).all(),
                product: db
                  .select()
                  .from(schema.product)
                  .where(eq(schema.product.id, source.productId))
                  .get(),
              }),
            }),
          );
          expect(targetServiceState.receipts).toHaveLength(1);
          expect(targetServiceState.product).toEqual(
            expect.objectContaining({
              id: source.productId,
              name: source.sourceProduct.name,
            }),
          );

          const targetAccountBlockRepo = yield* getAccountBlockRepo({
            key: {
              generationId: targetGenerationId,
              accountId: source.accountId,
              accountName: main.accountName,
            },
          });
          const replayedAccountBlock = yield* makeAsync(() =>
            targetAccountBlockRepo.getReplayBlock({
              afterAccountIndex: null,
              throughAccountIndex: source.sourceAccountBlock.accountIndex,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(replayedAccountBlock).toEqual(
            expect.objectContaining({
              lastAccountCursor: source.sourceAccountBlock.lastAccountCursor,
              accountIndex: source.sourceAccountBlock.accountIndex,
              executedCommands: source.sourceAccountBlock.executedCommands,
              failedCommands: source.sourceAccountBlock.failedCommands,
            }),
          );

          // 4. Reauthentication and projection bootstrap create fresh target
          //    repos from target authoritative state, not copied source rows.
          const targetAuthorizationRepo = yield* getAuthorizationRepo({
            key: {
              generationId: targetGenerationId,
              accountId: source.accountId,
              accountName: main.accountName,
            },
          });
          const emptyTargetAuthorizations = yield* makeAsync(() =>
            targetAuthorizationRepo.getAuthorizedActorFrontends({
              accountName: main.accountName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(emptyTargetAuthorizations).toEqual([]);
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAuthorizationRepo,
              repo: AuthorizationRepo,
              key: {
                generationId: targetGenerationId,
                accountId: source.accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) => {
                const now = new Date(1);
                db.insert(schema.user)
                  .values({
                    id: source.userId,
                    actorId: source.actorId,
                    modelName: 'user',
                    name: 'Fresh target authorization user',
                    version: '1.0.0',
                    createdAt: now,
                    updatedAt: now,
                  })
                  .run();
              },
            }),
          );
          yield* makeAsync(() =>
            targetAuthorizationRepo.authorize({
              actor: { actorId: source.actorId, accountId: source.accountId },
              accountName: main.accountName,
              actorName: main.actorName,
              frontendName: main.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const targetActorRepo = yield* getActorRepo({
            key: {
              generationId: targetGenerationId,
              accountId: source.accountId,
              accountName: main.accountName,
              actorName: main.actorName,
              actorId: source.actorId,
            },
          });
          const targetActorProducts = yield* makeAsync(() =>
            targetActorRepo.dumpActorModelResources({
              accountName: main.accountName,
              actorName: main.actorName,
              modelName: 'product',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(targetActorProducts).toEqual([
            expect.objectContaining({ id: source.productId }),
          ]);

          const targetFrontendRepo = yield* getFrontendRepo({
            key: {
              generationId: targetGenerationId,
              accountId: source.accountId,
              accountName: main.accountName,
              actorName: main.actorName,
              actorId: source.actorId,
              frontendName: main.frontendName,
            },
          });
          const targetFrontendState = yield* makeAsync(() =>
            targetFrontendRepo.getFrontendState({
              accountId: source.accountId,
              accountName: main.accountName,
              actorId: source.actorId,
              actorName: main.actorName,
              frontendName: main.frontendName,
              systemWorkerName: 'system-worker-generation-replay-target',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(targetFrontendState.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: source.productId }),
            ]),
          );

          // 5. Historical service replay did not re-fanout. Publishing the next
          //    target block starts strictly after W and creates one new,
          //    commandless AccountBlock for the subscribed product.
          const targetServiceRepo = yield* getServiceRepo({
            key: { generationId: targetGenerationId, serviceName: 'app' },
          });
          const futureResult = yield* makeAsync(() =>
            targetServiceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [
                {
                  id: 'cmd_generation_replay_future_update',
                  commandName: 'updateProduct',
                  payload: {
                    id: source.productId,
                    name: 'Future target product',
                  },
                  version: '1.0.0',
                  systemVersion: system.version,
                  commandType: 'service',
                  serviceName: 'app',
                },
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(futureResult.failedCommands).toEqual([]);
          yield* makeAsync(() =>
            targetServiceRepo.drainServiceBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          const targetServiceBlockRepo = yield* getServiceBlockRepo({
            key: { generationId: targetGenerationId, serviceName: 'app' },
          });
          yield* makeAsync(() =>
            targetServiceBlockRepo.drainAccountSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));

          const targetAccountStateAfter = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: targetGenerationId,
                accountId: source.accountId,
                accountName: main.accountName,
              },
              fn: ({ db, schema }) => ({
                product: db
                  .select()
                  .from(schema.product)
                  .where(eq(schema.product.id, source.productId))
                  .get(),
                receipts: db.select().from(schema.accountReplayReceipts).all(),
                subscriptions: db
                  .select()
                  .from(schema.serviceSubscriptions)
                  .all(),
              }),
            }),
          );
          expect(targetAccountStateAfter.product).toEqual(
            expect.objectContaining({ name: 'Future target product' }),
          );
          expect(targetAccountStateAfter.receipts).toHaveLength(1);
          expect(targetAccountStateAfter.subscriptions).toEqual([
            expect.objectContaining({
              currentServiceIndex:
                source.sourceSubscription.currentServiceIndex + 1,
            }),
          ]);
          const futureAccountBound = yield* makeAsync(() =>
            targetAccountBlockRepo.getReplayBound(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(futureAccountBound.accountIndex).toBe(
            source.sourceAccountBlock.accountIndex + 1,
          );
          const futureAccountBlock = yield* makeAsync(() =>
            targetAccountBlockRepo.getReplayBlock({
              afterAccountIndex: source.sourceAccountBlock.accountIndex,
              throughAccountIndex: source.sourceAccountBlock.accountIndex + 1,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(futureAccountBlock).toEqual(
            expect.objectContaining({
              accountIndex: source.sourceAccountBlock.accountIndex + 1,
              executedCommands: [],
              failedCommands: [],
              appliedMutations: [
                expect.objectContaining({
                  modelName: 'product',
                  operationName: 'update',
                  resourceId: source.productId,
                }),
              ],
            }),
          );
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'resumes an interrupted same-deploy preparation from its completed service receipt',
      () =>
        Effect.gen(function* () {
          const source = yield* prepareReplaySource({
            suffix: 'resume',
            createDerivedRepos: false,
          });
          const targetGenerationId = 'gen_generation_replay_target_resume';
          const targetDeployId = 'dpl_generation_replay_target_resume';
          const targetServiceRepo = yield* getServiceRepo({
            key: { generationId: targetGenerationId, serviceName: 'app' },
          });

          // 1. Model process death after one service replay transaction and its
          //    SystemRepo completion, but before account replay and readiness.
          const firstServiceReplay = yield* makeAsync(() =>
            targetServiceRepo.replayServiceBlock({
              deployId: targetDeployId,
              prevGenerationId: source.prevGenerationId,
              block: source.sourceServiceBlock,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(firstServiceReplay.replayed).toBe(true);
          const sourceServiceRepoName =
            yield* ServiceRepo.repoUtils.nameUtils.makeName({
              generationId: source.prevGenerationId,
              serviceName: 'app',
            });
          const targetServiceRepoName =
            yield* ServiceRepo.repoUtils.nameUtils.makeName({
              generationId: targetGenerationId,
              serviceName: 'app',
            });
          yield* Effect.promise(() =>
            runInDurableObject(
              env.SYSTEM_REPO.getByName(`sysrepo_${targetGenerationId}`),
              (_instance, state) => {
                const now = Date.now();
                state.storage.sql.exec(
                  `INSERT INTO generationState (
                    generationId, prevGenerationId, initialDeployId,
                    activeDeployId, preparingDeployId, readiness, admission,
                    activeSystemSpec, preparingSystemSpec, failure,
                    createdAt, readyAt, openedAt, drainedAt
                  ) VALUES (?, ?, ?, NULL, ?, 'initializing', 'closed', NULL, ?, NULL, ?, NULL, NULL, NULL)`,
                  targetGenerationId,
                  source.prevGenerationId,
                  targetDeployId,
                  targetDeployId,
                  Schema.encodeUnknownSync(Schema.parseJson(SystemSpecSchema))(
                    source.systemSpec,
                  ),
                  now,
                );
                state.storage.sql.exec(
                  `INSERT INTO replayCompletions (
                    deployId, repoType, prevRepoName, targetRepoName,
                    terminalIndex, blockCount, completedAt
                  ) VALUES (?, 'ServiceRepo', ?, ?, ?, 1, ?)`,
                  targetDeployId,
                  sourceServiceRepoName,
                  targetServiceRepoName,
                  source.sourceServiceBound.serviceIndex,
                  now,
                );
              },
            ),
          );

          // 2. The same deploy resumes, skips its exact completion, replays the
          //    account, and marks readiness without duplicating service state.
          const resumed = yield* prepareGeneration({
            deployId: targetDeployId,
            generationId: targetGenerationId,
            prevGenerationId: source.prevGenerationId,
            systemSpec: source.systemSpec,
            seeds: [],
          });
          expect(resumed).toEqual({
            deployId: targetDeployId,
            generationId: targetGenerationId,
            readiness: 'ready',
            reusedGeneration: false,
          });
          const resumedState = yield* readGenerationState({
            generationId: targetGenerationId,
          });
          expect(resumedState?.replayCompletions).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                repoType: 'ServiceRepo',
                blockCount: 1,
              }),
              expect.objectContaining({
                repoType: 'AccountRepo',
                blockCount: 1,
              }),
            ]),
          );
          const targetServiceReceipts = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceRepo,
              repo: ServiceRepo,
              key: { generationId: targetGenerationId, serviceName: 'app' },
              fn: ({ db, schema }) =>
                db.select().from(schema.serviceReplayReceipts).all(),
            }),
          );
          expect(targetServiceReceipts).toHaveLength(1);
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'marks adapter replay failure permanent and rejects the same deploy retry',
      () =>
        Effect.gen(function* () {
          const source = yield* prepareReplaySource({
            suffix: 'adapter_failure',
            createDerivedRepos: false,
          });
          const targetGenerationId =
            'gen_generation_replay_target_adapter_failure';
          const targetDeployId = 'dpl_generation_replay_target_adapter_failure';

          // 1. Inject one persisted historical mutation that cannot decode as
          //    current and has no direct controller-owned adapter edge.
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceBlockRepo,
              repo: ServiceBlockRepo,
              key: {
                generationId: source.prevGenerationId,
                serviceName: 'app',
              },
              fn: ({ db, schema }) => {
                const row = db
                  .select()
                  .from(schema.serviceBlocks)
                  .where(
                    eq(
                      schema.serviceBlocks.serviceIndex,
                      source.sourceServiceBlock.serviceIndex,
                    ),
                  )
                  .get();
                if (row === undefined) {
                  throw new Error('Expected the source service block row');
                }
                const block = Schema.decodeUnknownSync(
                  Schema.parseJson(ServiceBlockSchema),
                )(row.block);
                const mutation = block.appliedMutations[0];
                if (mutation === undefined) {
                  throw new Error('Expected one applied source mutation');
                }
                const operation = JSON.parse(mutation.operation);
                if (typeof operation !== 'object' || operation === null) {
                  throw new Error('Expected an encoded mutation operation');
                }
                const encodedAttributes = Reflect.get(
                  operation,
                  'encodedAttributes',
                );
                if (
                  typeof encodedAttributes !== 'object' ||
                  encodedAttributes === null
                ) {
                  throw new Error('Expected encoded create attributes');
                }
                const tamperedBlock = {
                  ...block,
                  appliedMutations: [
                    {
                      ...mutation,
                      modelVersion: '0.9.0',
                      operation: JSON.stringify({
                        ...operation,
                        encodedAttributes: {
                          ...encodedAttributes,
                          retiredRequiredField: 'requires-an-adapter',
                        },
                      }),
                    },
                    ...block.appliedMutations.slice(1),
                  ],
                };
                db.update(schema.serviceBlocks)
                  .set({
                    block: Schema.encodeUnknownSync(
                      Schema.parseJson(ServiceBlockSchema),
                    )(tamperedBlock),
                  })
                  .where(
                    eq(
                      schema.serviceBlocks.serviceIndex,
                      source.sourceServiceBlock.serviceIndex,
                    ),
                  )
                  .run();
              },
            }),
          );

          const failed = yield* prepareGeneration({
            deployId: targetDeployId,
            generationId: targetGenerationId,
            prevGenerationId: source.prevGenerationId,
            systemSpec: source.systemSpec,
            seeds: [],
          }).pipe(Effect.either);
          expect(failed._tag).toBe('Left');
          if (failed._tag === 'Left') {
            expect(failed.left.code).toBe('drizzle-transaction-failed');
          }
          const failedState = yield* readGenerationState({
            generationId: targetGenerationId,
          });
          expect(failedState).toMatchObject({
            readiness: 'failed',
            admission: 'closed',
          });
          expect(failedState?.failure).toContain(
            'replay-mutation-adapter-missing',
          );

          // 2. A failed lineage cannot be trusted or resumed even by its
          //    original deploy with the identical candidate SystemSpec.
          const retry = yield* prepareGeneration({
            deployId: targetDeployId,
            generationId: targetGenerationId,
            prevGenerationId: source.prevGenerationId,
            systemSpec: source.systemSpec,
            seeds: [],
          }).pipe(Effect.either);
          expect(retry._tag).toBe('Left');
          if (retry._tag === 'Left') {
            expect(retry.left.code).toBe('failed-generation-cannot-resume');
          }
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'rejects target model constraints instead of overwriting preexisting state',
      () =>
        Effect.gen(function* () {
          const source = yield* prepareReplaySource({
            suffix: 'target_constraint',
            createDerivedRepos: false,
          });
          const targetGenerationId = 'gen_generation_replay_target_constraint';
          const targetDeployId = 'dpl_generation_replay_target_constraint';

          // 1. A target row with the replayed primary key is not migration
          //    history. The create mutation must hit the target constraint.
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceRepo,
              repo: ServiceRepo,
              key: { generationId: targetGenerationId, serviceName: 'app' },
              fn: ({ db, schema }) => {
                const now = new Date(0);
                db.insert(schema.product)
                  .values({
                    id: source.productId,
                    modelName: 'product',
                    name: 'Conflicting target product',
                    version: '1.0.0',
                    createdAt: now,
                    updatedAt: now,
                  })
                  .run();
              },
            }),
          );

          const rejected = yield* prepareGeneration({
            deployId: targetDeployId,
            generationId: targetGenerationId,
            prevGenerationId: source.prevGenerationId,
            systemSpec: source.systemSpec,
            seeds: [],
          }).pipe(Effect.either);
          expect(rejected._tag).toBe('Left');
          const failedState = yield* readGenerationState({
            generationId: targetGenerationId,
          });
          expect(failedState?.readiness).toBe('failed');
          expect(failedState?.failure).toContain('UNIQUE constraint failed');
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect(
      'rejects a target replay block that has no matching receipt',
      () =>
        Effect.gen(function* () {
          const source = yield* prepareReplaySource({
            suffix: 'target_topology',
            createDerivedRepos: false,
          });
          const targetGenerationId = 'gen_generation_replay_target_topology';
          const targetDeployId = 'dpl_generation_replay_target_topology';

          // 1. A block without its transactionally paired replay receipt is an
          //    impossible target topology and must not be inferred as complete.
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getServiceRepo,
              repo: ServiceRepo,
              key: { generationId: targetGenerationId, serviceName: 'app' },
              fn: ({ db, schema }) => {
                db.insert(schema.serviceBlockOutbox)
                  .values({
                    lastServiceCursor:
                      source.sourceServiceBlock.lastServiceCursor,
                    serviceIndex: source.sourceServiceBlock.serviceIndex,
                    block: Schema.encodeUnknownSync(
                      Schema.parseJson(ServiceBlockSchema),
                    )(source.sourceServiceBlock),
                    publishedAt: null,
                    failure: null,
                  })
                  .run();
              },
            }),
          );

          const rejected = yield* prepareGeneration({
            deployId: targetDeployId,
            generationId: targetGenerationId,
            prevGenerationId: source.prevGenerationId,
            systemSpec: source.systemSpec,
            seeds: [],
          }).pipe(Effect.either);
          expect(rejected._tag).toBe('Left');
          if (rejected._tag === 'Left') {
            expect(rejected.left.code).toBe('drizzle-transaction-failed');
          }
          const failedState = yield* readGenerationState({
            generationId: targetGenerationId,
          });
          expect(failedState?.readiness).toBe('failed');
          expect(failedState?.failure).toContain(
            'service-replay-target-block-without-receipt',
          );
        }).pipe(Effect.provide(AsyncLive)),
    );

    it.effect('rejects a target generation with an extra data-owner repo', () =>
      Effect.gen(function* () {
        const source = yield* prepareReplaySource({
          suffix: 'target_count',
          createDerivedRepos: false,
        });
        const targetGenerationId = 'gen_generation_replay_target_count';
        const targetDeployId = 'dpl_generation_replay_target_count';

        // 1. Construct an unrelated inventory ServiceRepo in the target. The
        //    migration may replay app, but final source/target counts differ.
        const extraServiceRepo = yield* getServiceRepo({
          key: {
            generationId: targetGenerationId,
            serviceName: 'inventory',
          },
        });
        yield* makeAsync(() =>
          extraServiceRepo.getRepoTableRows({ tableName: 'stock' }),
        ).pipe(Effect.flatMap(decodeRpc));

        const rejected = yield* prepareGeneration({
          deployId: targetDeployId,
          generationId: targetGenerationId,
          prevGenerationId: source.prevGenerationId,
          systemSpec: source.systemSpec,
          seeds: [],
        }).pipe(Effect.either);
        expect(rejected._tag).toBe('Left');
        if (rejected._tag === 'Left') {
          expect(rejected.left.code).toBe(
            'generation-target-repo-count-mismatch',
          );
        }
        const failedState = yield* readGenerationState({
          generationId: targetGenerationId,
        });
        expect(failedState?.readiness).toBe('failed');
      }).pipe(Effect.provide(AsyncLive)),
    );
  });
});
