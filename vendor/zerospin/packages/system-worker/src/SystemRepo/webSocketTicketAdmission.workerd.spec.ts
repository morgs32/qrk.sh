import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { env, runInDurableObject } from 'cloudflare:test';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { main, system } from '../fixtures/system.js';
import { prepareGenerationStateFixture } from '../workerd-utils/prepareGenerationStateFixture.js';

import { SystemRepo } from './SystemRepo.js';

describe('SystemRepo WebSocket ticket read admission', () => {
  it.effect(
    'admits tickets while draining and rejects pre-minted tickets after retirement',
    () =>
      Effect.gen(function* () {
        const active = yield* prepareGenerationStateFixture({
          clean: true,
          workerVersionId: 'websocket-ticket-read-admission',
        });
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        const systemSpec = makeSystemSpec({ system });
        const aggregateFrontendLock =
          systemSpec.aggregates[main.aggregateName]?.frontends[
            main.frontendName
          ]?.controller.aggregateFrontendLock;
        const serviceFrontendLock =
          systemSpec.services.app?.frontends.products?.controller
            .serviceFrontendLock;
        if (
          aggregateFrontendLock === undefined ||
          serviceFrontendLock === undefined
        ) {
          return yield* Effect.die(
            new Error('Fixture frontend locks are missing'),
          );
        }

        const frontendTicket = yield* makeAsync(() =>
          systemRepo.createAggregateFrontendWebSocketTicket({
            generationId: active.generationId,
            repoName: 'frepo_ticket_read_admission',
            aggregateId: makeAggregateId({
              id: 'ticket-read-admission',
            }),
            aggregateName: main.aggregateName,
            userId: 'usr_ticket_read_admission',
            frontendName: main.frontendName,
            aggregateFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const serviceTicket = yield* makeAsync(() =>
          systemRepo.createServiceFrontendWebSocketTicket({
            generationId: active.generationId,
            repoName: 'sfrepo_ticket_read_admission',
            serviceName: 'app',
            userId: 'usr_ticket_read_admission',
            frontendName: 'products',
            serviceFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => {
            state.storage.sql.exec(
              "UPDATE generationState SET phase = 'draining' WHERE generationId = ?",
              active.generationId,
            );
          }),
        );

        const frontendWhileDraining = yield* makeAsync(() =>
          systemRepo.consumeAggregateFrontendWebSocketTicket({
            ticket: frontendTicket,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(frontendWhileDraining).toMatchObject({
          generationId: active.generationId,
          repoName: 'frepo_ticket_read_admission',
        });
        const serviceWhileDraining = yield* makeAsync(() =>
          systemRepo.consumeServiceFrontendWebSocketTicket({
            ticket: serviceTicket,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(serviceWhileDraining).toMatchObject({
          generationId: active.generationId,
          repoName: 'sfrepo_ticket_read_admission',
        });

        const frontendTicketBeforeRetirement = yield* makeAsync(() =>
          systemRepo.createAggregateFrontendWebSocketTicket({
            generationId: active.generationId,
            repoName: 'frepo_ticket_before_retirement',
            aggregateId: makeAggregateId({
              id: 'ticket-before-retirement',
            }),
            aggregateName: main.aggregateName,
            userId: 'usr_ticket_before_retirement',
            frontendName: main.frontendName,
            aggregateFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const serviceTicketBeforeRetirement = yield* makeAsync(() =>
          systemRepo.createServiceFrontendWebSocketTicket({
            generationId: active.generationId,
            repoName: 'sfrepo_ticket_before_retirement',
            serviceName: 'app',
            userId: 'usr_ticket_before_retirement',
            frontendName: 'products',
            serviceFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => {
            state.storage.sql.exec(
              "UPDATE generationState SET phase = 'retired', retiredAt = ? WHERE generationId = ?",
              Date.now(),
              active.generationId,
            );
          }),
        );

        const frontendResult = yield* makeAsync(() =>
          systemRepo.consumeAggregateFrontendWebSocketTicket({
            ticket: frontendTicketBeforeRetirement,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(frontendResult._tag).toBe('Left');
        if (frontendResult._tag === 'Left') {
          expect(frontendResult.left.code).toBe(
            'generation-read-admission-closed',
          );
          expect(frontendResult.left.extra).toMatchObject({
            generationId: active.generationId,
            phase: 'retired',
          });
        }

        const serviceResult = yield* makeAsync(() =>
          systemRepo.consumeServiceFrontendWebSocketTicket({
            ticket: serviceTicketBeforeRetirement,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(serviceResult._tag).toBe('Left');
        if (serviceResult._tag === 'Left') {
          expect(serviceResult.left.code).toBe(
            'generation-read-admission-closed',
          );
          expect(serviceResult.left.extra).toMatchObject({
            generationId: active.generationId,
            phase: 'retired',
          });
        }

        yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => {
            state.storage.sql.exec(
              "UPDATE generationState SET phase = 'open', retiredAt = NULL WHERE generationId = ?",
              active.generationId,
            );
          }),
        );
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'revokes G1 tickets at linked promotion and admits equivalent G2 tickets',
    () =>
      Effect.gen(function* () {
        const origin = yield* prepareGenerationStateFixture({
          clean: true,
          workerVersionId: 'websocket-ticket-drained-origin',
        });
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        const systemSpec = makeSystemSpec({ system });
        const aggregateFrontendLock =
          systemSpec.aggregates[main.aggregateName]?.frontends[
            main.frontendName
          ]?.controller.aggregateFrontendLock;
        const serviceFrontendLock =
          systemSpec.services.app?.frontends.products?.controller
            .serviceFrontendLock;
        if (
          aggregateFrontendLock === undefined ||
          serviceFrontendLock === undefined
        ) {
          return yield* Effect.die(
            new Error('Fixture frontend locks are missing'),
          );
        }

        const frontendTicketBeforePromotion = yield* makeAsync(() =>
          systemRepo.createAggregateFrontendWebSocketTicket({
            generationId: origin.generationId,
            repoName: 'frepo_ticket_before_promotion',
            aggregateId: makeAggregateId({ id: 'ticket-before-promotion' }),
            aggregateName: main.aggregateName,
            userId: 'usr_ticket_before_promotion',
            frontendName: main.frontendName,
            aggregateFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const serviceTicketBeforePromotion = yield* makeAsync(() =>
          systemRepo.createServiceFrontendWebSocketTicket({
            generationId: origin.generationId,
            repoName: 'sfrepo_ticket_before_promotion',
            serviceName: 'app',
            userId: 'usr_ticket_before_promotion',
            frontendName: 'products',
            serviceFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const historicalSystemSpec = structuredClone(systemSpec);
        historicalSystemSpec.version = '0.9.0';
        Reflect.deleteProperty(historicalSystemSpec.services, 'inventory');
        yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => {
            const encodedHistoricalSystemSpec =
              JSON.stringify(historicalSystemSpec);
            state.storage.sql.exec(
              'UPDATE deploy SET systemSpec = ? WHERE id = ?',
              encodedHistoricalSystemSpec,
              origin.deployId,
            );
            state.storage.sql.exec(
              'UPDATE generationState SET activeSystemSpec = ? WHERE generationId = ?',
              encodedHistoricalSystemSpec,
              origin.generationId,
            );
          }),
        );

        const successor = yield* prepareGenerationStateFixture({
          clean: false,
          workerVersionId: 'websocket-ticket-drained-successor',
        });
        expect(successor.generationId).not.toBe(origin.generationId);
        const originState = yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) =>
            state.storage.sql
              .exec<{ phase: string }>(
                'SELECT phase FROM generationState WHERE generationId = ?',
                origin.generationId,
              )
              .one(),
          ),
        );
        expect(originState).toEqual({ phase: 'retired' });

        const replacementFrontendResult = yield* makeAsync(() =>
          systemRepo.createAggregateFrontendWebSocketTicket({
            generationId: origin.generationId,
            repoName: 'frepo_ticket_drained',
            aggregateId: makeAggregateId({ id: 'ticket-drained' }),
            aggregateName: main.aggregateName,
            userId: 'usr_ticket_drained',
            frontendName: main.frontendName,
            aggregateFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(replacementFrontendResult._tag).toBe('Left');
        if (replacementFrontendResult._tag === 'Left') {
          expect(replacementFrontendResult.left.code).toBe(
            'generation-read-admission-closed',
          );
          expect(replacementFrontendResult.left.extra).toMatchObject({
            generationId: origin.generationId,
            phase: 'retired',
          });
        }
        const replacementServiceResult = yield* makeAsync(() =>
          systemRepo.createServiceFrontendWebSocketTicket({
            generationId: origin.generationId,
            repoName: 'sfrepo_ticket_drained',
            serviceName: 'app',
            userId: 'usr_ticket_drained',
            frontendName: 'products',
            serviceFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(replacementServiceResult._tag).toBe('Left');
        if (replacementServiceResult._tag === 'Left') {
          expect(replacementServiceResult.left.code).toBe(
            'generation-read-admission-closed',
          );
          expect(replacementServiceResult.left.extra).toMatchObject({
            generationId: origin.generationId,
            phase: 'retired',
          });
        }

        const frontendTargetBeforePromotion = yield* makeAsync(() =>
          systemRepo.consumeAggregateFrontendWebSocketTicket({
            ticket: frontendTicketBeforePromotion,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(frontendTargetBeforePromotion._tag).toBe('Left');
        if (frontendTargetBeforePromotion._tag === 'Left') {
          expect(frontendTargetBeforePromotion.left.code).toBe(
            'generation-read-admission-closed',
          );
        }
        const serviceTargetBeforePromotion = yield* makeAsync(() =>
          systemRepo.consumeServiceFrontendWebSocketTicket({
            ticket: serviceTicketBeforePromotion,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(serviceTargetBeforePromotion._tag).toBe('Left');
        if (serviceTargetBeforePromotion._tag === 'Left') {
          expect(serviceTargetBeforePromotion.left.code).toBe(
            'generation-read-admission-closed',
          );
        }

        const successorFrontendTicket = yield* makeAsync(() =>
          systemRepo.createAggregateFrontendWebSocketTicket({
            generationId: successor.generationId,
            repoName: 'frepo_ticket_successor',
            aggregateId: makeAggregateId({ id: 'ticket-successor' }),
            aggregateName: main.aggregateName,
            userId: 'usr_ticket_successor',
            frontendName: main.frontendName,
            aggregateFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const successorServiceTicket = yield* makeAsync(() =>
          systemRepo.createServiceFrontendWebSocketTicket({
            generationId: successor.generationId,
            repoName: 'sfrepo_ticket_successor',
            serviceName: 'app',
            userId: 'usr_ticket_successor',
            frontendName: 'products',
            serviceFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const successorFrontendTarget = yield* makeAsync(() =>
          systemRepo.consumeAggregateFrontendWebSocketTicket({
            ticket: successorFrontendTicket,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(successorFrontendTarget).toMatchObject({
          generationId: successor.generationId,
          repoName: 'frepo_ticket_successor',
        });
        const successorServiceTarget = yield* makeAsync(() =>
          systemRepo.consumeServiceFrontendWebSocketTicket({
            ticket: successorServiceTicket,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(successorServiceTarget).toMatchObject({
          generationId: successor.generationId,
          repoName: 'sfrepo_ticket_successor',
        });
      }).pipe(Effect.provide(AsyncLive)),
  );
});
