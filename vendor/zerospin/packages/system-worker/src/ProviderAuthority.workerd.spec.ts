/*
 * Provider-authority integration coverage:
 *
 * 1. A recorded successor redirects account state, account push, and service
 *    state before any projection repository is resolved.
 * 2. A same-generation frontend specification change rejects account state
 *    and push before a write reservation can be created.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { prefixActorId } from '@zerospin/core/utils/prefixActorId';
import { env, runInDurableObject } from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { createFrontendWebSocketTicket } from './createFrontendWebSocketTicket/createFrontendWebSocketTicket.js';
import { drainGeneration } from './drainGeneration/drainGeneration.js';
import { main, system } from './fixtures/system.js';
import { openGeneration } from './openGeneration/openGeneration.js';
import { prepareGeneration } from './prepareGeneration/prepareGeneration.js';
import { SystemWorker } from './SystemWorker.js';

describe('SystemWorker provider authority', () => {
  it.effect(
    'redirects account state, account push, and service state to a recorded successor',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_provider_authority_transition';
        const successorGenerationId =
          'gen_provider_authority_transition_successor';
        const deployId = 'dpl_provider_authority_transition';
        const accountId = makeAccountId({ id: 'provider-authority' });
        const actorId = prefixActorId('provider-authority');

        yield* prepareGeneration({
          deployId,
          generationId,
          prevGenerationId: null,
          systemSpec: makeSystemSpec({ system }),
          seeds: [],
        });
        yield* openGeneration({ deployId, generationId });
        yield* drainGeneration({
          deployId,
          generationId,
          mode: 'freeze',
          successorGenerationId: null,
        });
        yield* drainGeneration({
          deployId,
          generationId,
          mode: 'complete',
          successorGenerationId,
        });

        const accountStateEncoded = yield* makeAsync(() =>
          SystemWorker.prototype.getFrontendState({
            deployId,
            generationId,
            accountId,
            accountName: main.accountName,
            actorId,
            actorName: main.actorName,
            frontendName: main.frontendName,
            systemWorkerName: 'system-worker-provider-authority',
          }),
        );
        const accountState = yield* decodeRpc(accountStateEncoded).pipe(
          Effect.either,
        );
        expect(accountState._tag).toBe('Left');
        if (accountState._tag === 'Left') {
          expect(accountState.left.code).toBe('frontend-generation-changed');
          expect(accountState.left.extra).toMatchObject({
            generationId,
            successorGenerationId,
          });
        }

        const pushEncoded = yield* makeAsync(() =>
          SystemWorker.prototype.pushCommands({
            deployId,
            generationId,
            accountId,
            accountName: main.accountName,
            actorId,
            actorName: main.actorName,
            frontendName: main.frontendName,
            commands: [],
          }),
        );
        const push = yield* decodeRpc(pushEncoded).pipe(Effect.either);
        expect(push._tag).toBe('Left');
        if (push._tag === 'Left') {
          expect(push.left.code).toBe('frontend-generation-changed');
          expect(push.left.extra).toMatchObject({
            generationId,
            successorGenerationId,
          });
        }

        const serviceStateEncoded = yield* makeAsync(() =>
          SystemWorker.prototype.getServiceFrontendState({
            deployId,
            generationId,
            serviceName: 'app',
            actorName: 'shopper',
            actorId,
            frontendName: 'products',
            systemWorkerName: 'system-worker-provider-authority',
          }),
        );
        const serviceState = yield* decodeRpc(serviceStateEncoded).pipe(
          Effect.either,
        );
        expect(serviceState._tag).toBe('Left');
        if (serviceState._tag === 'Left') {
          expect(serviceState.left.code).toBe('frontend-generation-changed');
          expect(serviceState.left.extra).toMatchObject({
            generationId,
            successorGenerationId,
          });
        }

        const reservationCount = yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${generationId}`),
            (_instance, state) =>
              state.storage.sql
                .exec<{ count: number }>(
                  'SELECT COUNT(*) AS count FROM generationWriteReservations',
                )
                .one(),
          ),
        );
        expect(reservationCount.count).toBe(0);
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'rejects a same-generation account frontend specification change before projection access',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_provider_authority_version';
        const deployId = 'dpl_provider_authority_version';
        const accountId = makeAccountId({ id: 'provider-version' });
        const actorId = prefixActorId('provider-version');
        const changedSystemSpec = structuredClone(makeSystemSpec({ system }));
        const changedFrontend =
          changedSystemSpec.accountControllers[main.accountName]
            ?.actorControllers[main.actorName]?.frontends[main.frontendName];
        if (changedFrontend === undefined) {
          return yield* Effect.die(
            new Error('Expected the fixture account frontend'),
          );
        }
        changedFrontend.frontendController.version = '2.0.0';

        yield* prepareGeneration({
          deployId,
          generationId,
          prevGenerationId: null,
          systemSpec: makeSystemSpec({ system }),
          seeds: [],
        });
        yield* openGeneration({ deployId, generationId });
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${generationId}`),
            (_instance, state) => {
              state.storage.sql.exec(
                'UPDATE generationState SET activeSystemSpec = ? WHERE generationId = ?',
                Schema.encodeUnknownSync(Schema.parseJson(SystemSpecSchema))(
                  changedSystemSpec,
                ),
                generationId,
              );
            },
          ),
        );

        const accountStateEncoded = yield* makeAsync(() =>
          SystemWorker.prototype.getFrontendState({
            deployId,
            generationId,
            accountId,
            accountName: main.accountName,
            actorId,
            actorName: main.actorName,
            frontendName: main.frontendName,
            systemWorkerName: 'system-worker-provider-authority',
          }),
        );
        const accountState = yield* decodeRpc(accountStateEncoded).pipe(
          Effect.either,
        );
        expect(accountState._tag).toBe('Left');
        if (accountState._tag === 'Left') {
          expect(accountState.left.code).toBe('frontend-version-changed');
          expect(accountState.left.extra).toMatchObject({
            frontendVersion: '1.0.0',
            authoritativeFrontendVersion: '2.0.0',
          });
        }

        const pushEncoded = yield* makeAsync(() =>
          SystemWorker.prototype.pushCommands({
            deployId,
            generationId,
            accountId,
            accountName: main.accountName,
            actorId,
            actorName: main.actorName,
            frontendName: main.frontendName,
            commands: [],
          }),
        );
        const push = yield* decodeRpc(pushEncoded).pipe(Effect.either);
        expect(push._tag).toBe('Left');
        if (push._tag === 'Left') {
          expect(push.left.code).toBe('frontend-version-changed');
        }

        const reservationCount = yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${generationId}`),
            (_instance, state) =>
              state.storage.sql
                .exec<{ count: number }>(
                  'SELECT COUNT(*) AS count FROM generationWriteReservations',
                )
                .one(),
          ),
        );
        expect(reservationCount.count).toBe(0);
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'allows a same-generation frontend version change but rejects changed model schemas',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_provider_authority_ticket_reuse';
        const deployId = 'dpl_provider_authority_ticket_reuse';
        const accountId = makeAccountId({ id: 'provider-ticket-reuse' });
        const actorId = prefixActorId('provider-ticket-reuse');
        const versionOnlySystemSpec = structuredClone(
          makeSystemSpec({ system }),
        );
        const versionOnlyFrontend =
          versionOnlySystemSpec.accountControllers[main.accountName]
            ?.actorControllers[main.actorName]?.frontends[main.frontendName];
        if (versionOnlyFrontend === undefined) {
          return yield* Effect.die(
            new Error('Expected the fixture account frontend'),
          );
        }
        versionOnlyFrontend.frontendController.version = '2.0.0';

        yield* prepareGeneration({
          deployId,
          generationId,
          prevGenerationId: null,
          systemSpec: makeSystemSpec({ system }),
          seeds: [],
        });
        yield* openGeneration({ deployId, generationId });
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${generationId}`),
            (_instance, state) => {
              state.storage.sql.exec(
                'UPDATE generationState SET activeSystemSpec = ? WHERE generationId = ?',
                Schema.encodeUnknownSync(Schema.parseJson(SystemSpecSchema))(
                  versionOnlySystemSpec,
                ),
                generationId,
              );
            },
          ),
        );

        const versionOnlyTicket = yield* createFrontendWebSocketTicket({
          deployId,
          generationId,
          accountId,
          accountName: main.accountName,
          actorId,
          actorName: main.actorName,
          frontendName: main.frontendName,
          configuredSystemId: env.ZEROSPIN_SYSTEM_ID,
        }).pipe(Effect.either);
        expect(versionOnlyTicket._tag).toBe('Left');
        if (versionOnlyTicket._tag === 'Left') {
          expect(versionOnlyTicket.left.code).toBe('frontend-state-required');
        }

        const modelChangedSystemSpec = structuredClone(versionOnlySystemSpec);
        const modelChangedProduct =
          modelChangedSystemSpec.serviceControllers.app?.models.product;
        if (modelChangedProduct === undefined) {
          return yield* Effect.die(
            new Error('Expected the fixture service Product model'),
          );
        }
        modelChangedProduct.indexes = [
          {
            name: 'provider_authority_product_name',
            columns: ['name'],
            unique: false,
          },
        ];
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${generationId}`),
            (_instance, state) => {
              state.storage.sql.exec(
                'UPDATE generationState SET activeSystemSpec = ? WHERE generationId = ?',
                Schema.encodeUnknownSync(Schema.parseJson(SystemSpecSchema))(
                  modelChangedSystemSpec,
                ),
                generationId,
              );
            },
          ),
        );

        const modelChangedTicket = yield* createFrontendWebSocketTicket({
          deployId,
          generationId,
          accountId,
          accountName: main.accountName,
          actorId,
          actorName: main.actorName,
          frontendName: main.frontendName,
          configuredSystemId: env.ZEROSPIN_SYSTEM_ID,
        }).pipe(Effect.either);
        expect(modelChangedTicket._tag).toBe('Left');
        if (modelChangedTicket._tag === 'Left') {
          expect(modelChangedTicket.left.code).toBe(
            'frontend-ticket-generation-reuse-model-mismatch',
          );
        }
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'fails closed for a corrupt successor predecessor and a successor cycle',
    () =>
      Effect.gen(function* () {
        const generationId = 'gen_provider_authority_ticket_chain';
        const successorGenerationId =
          'gen_provider_authority_ticket_chain_successor';
        const deployId = 'dpl_provider_authority_ticket_chain';
        const successorDeployId =
          'dpl_provider_authority_ticket_chain_successor';
        const accountId = makeAccountId({ id: 'provider-ticket-chain' });
        const actorId = prefixActorId('provider-ticket-chain');
        const systemSpec = makeSystemSpec({ system });

        yield* prepareGeneration({
          deployId,
          generationId,
          prevGenerationId: null,
          systemSpec,
          seeds: [],
        });
        yield* openGeneration({ deployId, generationId });
        yield* drainGeneration({
          deployId,
          generationId,
          mode: 'freeze',
          successorGenerationId: null,
        });
        yield* drainGeneration({
          deployId,
          generationId,
          mode: 'complete',
          successorGenerationId,
        });
        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${successorGenerationId}`),
            (_instance, state) => {
              state.storage.sql.exec(
                `INSERT INTO generationState (
                  generationId, prevGenerationId, initialDeployId,
                  activeDeployId, preparingDeployId, readiness, admission,
                  activeSystemSpec, preparingSystemSpec, failure,
                  createdAt, readyAt, openedAt, drainFrozenAt, drainedAt,
                  successorGenerationId
                ) VALUES (?, 'gen_wrong_predecessor', ?, ?, NULL, 'ready', 'open', ?, NULL, NULL, ?, ?, ?, NULL, NULL, NULL)`,
                successorGenerationId,
                successorDeployId,
                successorDeployId,
                Schema.encodeUnknownSync(Schema.parseJson(SystemSpecSchema))(
                  systemSpec,
                ),
                1,
                2,
                3,
              );
            },
          ),
        );

        const corruptChainTicket = yield* createFrontendWebSocketTicket({
          deployId,
          generationId,
          accountId,
          accountName: main.accountName,
          actorId,
          actorName: main.actorName,
          frontendName: main.frontendName,
          configuredSystemId: env.ZEROSPIN_SYSTEM_ID,
        }).pipe(Effect.either);
        expect(corruptChainTicket._tag).toBe('Left');
        if (corruptChainTicket._tag === 'Left') {
          expect(corruptChainTicket.left.code).toBe(
            'frontend-ticket-successor-chain-mismatch',
          );
        }

        yield* Effect.promise(() =>
          runInDurableObject(
            env.SYSTEM_REPO.getByName(`sysrepo_${successorGenerationId}`),
            (_instance, state) => {
              state.storage.sql.exec(
                `UPDATE generationState
                 SET prevGenerationId = ?, admission = 'drained',
                     drainFrozenAt = ?, drainedAt = ?,
                     successorGenerationId = ?
                 WHERE generationId = ?`,
                generationId,
                4,
                5,
                generationId,
                successorGenerationId,
              );
            },
          ),
        );

        const cyclicChainTicket = yield* createFrontendWebSocketTicket({
          deployId,
          generationId,
          accountId,
          accountName: main.accountName,
          actorId,
          actorName: main.actorName,
          frontendName: main.frontendName,
          configuredSystemId: env.ZEROSPIN_SYSTEM_ID,
        }).pipe(Effect.either);
        expect(cyclicChainTicket._tag).toBe('Left');
        if (cyclicChainTicket._tag === 'Left') {
          expect(cyclicChainTicket.left.code).toBe(
            'frontend-ticket-successor-cycle',
          );
        }
      }).pipe(Effect.provide(AsyncLive)),
  );
});
