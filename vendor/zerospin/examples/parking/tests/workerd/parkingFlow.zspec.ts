import { describe, it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { makeTestApis } from '@zerospin/dispatch-worker/makeTestApis';
import { makeWorkerdE2eTestLayer } from '@zerospin/dispatch-worker/vitest/makeWorkerdE2eTestLayer';
import { Effect } from 'effect';
import { getAccountBlockRepo } from 'system-worker/AccountBlockRepo/getAccountBlockRepo/getAccountBlockRepo';
import { getActorBlockRepo } from 'system-worker/ActorBlockRepo/getActorBlockRepo/getActorBlockRepo';
import { getFrontendRepo } from 'system-worker/FrontendRepo/getFrontendRepo/getFrontendRepo';
import { expect } from 'vitest';

import { ownerFrontend, providerAdminFrontend } from '@/zerospin/frontends';
import { ParkingActor } from '@/zerospin/models';
import { driverAccount, providerAccount, system } from '@/zerospin/system';

const E2E_ACCOUNT_ID = makeAccountId({ id: '1' });
const E2E_CLERK_USER_ID = 'parking_e2e_1';
const E2E_ACTOR_ID = ParkingActor.prefixId(E2E_CLERK_USER_ID);

const TestLayer = makeWorkerdE2eTestLayer('parkingFlow');

describe('parkingFlow: provider and driver frontend state', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'finalizes provider data, authenticates both frontends, and delivers driver data',
      () =>
        Effect.gen(function* () {
          const destinationId = 'dst_e2e_downtown' as const;
          const garageId = 'gar_e2e_home' as const;
          const createDestination = yield* providerAccount.makeCommand({
            contractName: 'createDestination',
            accountId: E2E_ACCOUNT_ID,
            systemName: providerAdminFrontend.systemName,
            systemVersion: system.version,
            payload: {
              id: destinationId,
              name: 'E2E Downtown',
              slug: 'e2e-downtown',
              lat: 41.8781,
              lon: -87.6298,
            },
          });
          const createCarpark = yield* providerAccount.makeCommand({
            contractName: 'createCarpark',
            accountId: E2E_ACCOUNT_ID,
            systemName: providerAdminFrontend.systemName,
            systemVersion: system.version,
            payload: {
              destinationId,
              name: 'E2E Main Garage',
              address: '10 Test Plaza',
              hourlyRate: 15,
              lat: 41.879,
              lon: -87.63,
              amenities: 'Covered, EV charging',
            },
          });

          const apis = makeTestApis();
          const systemApi = yield* makeAsync(() =>
            apis.getSystemApi({ zerospinSecretKey: 'sk_test' }),
          );
          yield* makeAsync(() =>
            systemApi.finalizeAccountCommands({
              traceContext: null,
              args: [
                {
                  accountId: E2E_ACCOUNT_ID,
                  accountName: providerAdminFrontend.accountName,
                  commands: [createDestination, createCarpark],
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          const providerFrontendApi = yield* makeAsync(() =>
            apis.getFrontendApi({
              publishableKey: 'pk_test',
              accountName: providerAdminFrontend.accountName,
              actorName: providerAdminFrontend.actorName,
              frontendName: providerAdminFrontend.frontendName,
              signature: { clerkUserId: E2E_CLERK_USER_ID },
            }),
          );
          const providerState = yield* makeAsync(() =>
            providerFrontendApi.getFrontendState({
              traceContext: null,
              args: [],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(providerState.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                modelName: 'destination',
                name: 'E2E Downtown',
              }),
              expect.objectContaining({
                modelName: 'carpark',
                name: 'E2E Main Garage',
              }),
            ]),
          );

          const ownerFrontendApi = yield* makeAsync(() =>
            apis.getFrontendApi({
              publishableKey: 'pk_test',
              accountName: ownerFrontend.accountName,
              actorName: ownerFrontend.actorName,
              frontendName: ownerFrontend.frontendName,
              signature: { clerkUserId: E2E_CLERK_USER_ID },
            }),
          );
          yield* makeAsync(() =>
            ownerFrontendApi.getFrontendState({
              traceContext: null,
              args: [],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          const createGarage = yield* driverAccount.makeCommand({
            contractName: 'createGarage',
            accountId: E2E_ACCOUNT_ID,
            systemName: ownerFrontend.systemName,
            systemVersion: system.version,
            payload: {
              id: garageId,
              actorId: E2E_ACTOR_ID,
              name: 'E2E Home Garage',
              address: '20 Driver Way',
            },
          });
          const createCar = yield* driverAccount.makeCommand({
            contractName: 'createCar',
            accountId: E2E_ACCOUNT_ID,
            systemName: ownerFrontend.systemName,
            systemVersion: system.version,
            payload: {
              actorId: E2E_ACTOR_ID,
              garageId,
              licensePlate: 'E2E-101',
              make: 'Rivian',
              model: 'R1T',
            },
          });

          yield* makeAsync(() =>
            systemApi.finalizeAccountCommands({
              traceContext: null,
              args: [
                {
                  accountId: E2E_ACCOUNT_ID,
                  accountName: ownerFrontend.accountName,
                  commands: [createGarage, createCar],
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          const accountBlockRepo = yield* getAccountBlockRepo({
            key: {
              generationId: 'gen_test',
              accountId: E2E_ACCOUNT_ID,
              accountName: ownerFrontend.accountName,
            },
          });
          const actorBlockRepo = yield* getActorBlockRepo({
            key: {
              generationId: 'gen_test',
              accountId: E2E_ACCOUNT_ID,
              accountName: ownerFrontend.accountName,
              actorId: E2E_ACTOR_ID,
              actorName: ownerFrontend.actorName,
            },
          });
          const frontendRepo = yield* getFrontendRepo({
            key: {
              generationId: 'gen_test',
              accountId: E2E_ACCOUNT_ID,
              accountName: ownerFrontend.accountName,
              actorId: E2E_ACTOR_ID,
              actorName: ownerFrontend.actorName,
              frontendName: ownerFrontend.frontendName,
            },
          });
          yield* makeAsync(() => accountBlockRepo.drainActorOutbox()).pipe(
            Effect.flatMap(encoded => decodeRpc(encoded)),
          );
          yield* makeAsync(() =>
            actorBlockRepo.drainFrontendSubscribers(),
          ).pipe(Effect.flatMap(encoded => decodeRpc(encoded)));
          yield* makeAsync(() => frontendRepo.drainFrontendBlockOutbox()).pipe(
            Effect.flatMap(encoded => decodeRpc(encoded)),
          );

          const ownerState = yield* makeAsync(() =>
            ownerFrontendApi.getFrontendState({
              traceContext: null,
              args: [],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(ownerState.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                modelName: 'garage',
                name: 'E2E Home Garage',
              }),
              expect.objectContaining({
                licensePlate: 'E2E-101',
                modelName: 'car',
              }),
            ]),
          );
        }).pipe(Effect.provide(AsyncLive)),
      120_000,
    );
  });
});
