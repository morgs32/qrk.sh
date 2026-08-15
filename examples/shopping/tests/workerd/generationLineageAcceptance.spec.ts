import { describe, it } from '@effect/vitest';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeWorkerdE2eTestLayer } from '@zerospin/dev-worker/vitest/makeWorkerdE2eTestLayer';
import { newWebSocketRpcSession } from 'capnweb';
import { env, runInDurableObject, SELF } from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { SystemRepo } from 'system-worker/SystemRepo/SystemRepo';
import { expect } from 'vitest';

import { system } from '@/zerospin/system';

const TestLayer = makeWorkerdE2eTestLayer(
  'shoppingGenerationLineageAcceptance',
);

const DeploySnapshotSchema = Schema.Struct({
  deployId: Schema.String,
  generationId: Schema.String,
  status: Schema.Literal('activating', 'succeeded', 'failed'),
});

describe('shopping generation lineage acceptance', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'stores the statically bundled SystemSpec on the selected generation',
      () =>
        Effect.gen(function* () {
          const systemRepo = SystemRepo.getRepo({
            systemId: env.ZEROSPIN_SYSTEM_ID,
          });
          const generationId = yield* Effect.promise(() =>
            runInDurableObject(
              systemRepo,
              (_instance, state) =>
                state.storage.sql
                  .exec<{ generationId: string }>(
                    'SELECT deploy.generationId AS generationId FROM selection JOIN deploy ON deploy.id = selection.activeDeployId WHERE selection.id = ?',
                    'sctl_system',
                  )
                  .one().generationId,
            ),
          );
          const generation = yield* makeAsync(() =>
            systemRepo.getGenerationState({ generationId }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(generation?.activeSystemSpec).toEqual(
            makeSystemSpec({ system }),
          );
        }),
    );

    it.effect(
      'opens a new generation from frozen historical Shopping model definitions without loading predecessor code',
      () =>
        Effect.gen(function* () {
          const systemRepo = SystemRepo.getRepo({
            systemId: env.ZEROSPIN_SYSTEM_ID,
          });
          const origin = yield* Effect.promise(() =>
            runInDurableObject(systemRepo, (_instance, state) =>
              state.storage.sql
                .exec<{ deployId: string; generationId: string }>(
                  'SELECT deploy.id AS deployId, deploy.generationId AS generationId FROM selection JOIN deploy ON deploy.id = selection.activeDeployId WHERE selection.id = ?',
                  'sctl_system',
                )
                .one(),
            ),
          );
          const systemSpec = makeSystemSpec({ system });

          const historicalSystemSpec = structuredClone(systemSpec);
          historicalSystemSpec.version = '1.0.0';
          const cartItem =
            historicalSystemSpec.aggregates.shopper?.models.cartItem;
          const cartItemV1 = cartItem?.historicalDefinitions.find(
            definition => definition.version === '1.0.0',
          );
          if (cartItem === undefined || cartItemV1 === undefined) {
            return yield* Effect.fail(
              new Error('Expected retained Shopping CartItem@1.0.0'),
            );
          }
          cartItem.version = cartItemV1.version;
          cartItem.properties = cartItemV1.properties;
          cartItem.indexes = cartItemV1.indexes;
          yield* Effect.promise(() =>
            runInDurableObject(systemRepo, (_instance, state) => {
              state.storage.sql.exec(
                'UPDATE generationState SET activeSystemSpec = ? WHERE generationId = ?',
                Schema.encodeUnknownSync(Schema.parseJson(SystemSpecSchema))(
                  historicalSystemSpec,
                ),
                origin.generationId,
              );
              state.storage.sql.exec(
                'UPDATE deploy SET systemSpec = ?, workerVersionId = ? WHERE id = ?',
                Schema.encodeUnknownSync(Schema.parseJson(SystemSpecSchema))(
                  historicalSystemSpec,
                ),
                'shopping-historical-lineage-origin',
                origin.deployId,
              );
            }),
          );

          const gatewayApi = yield* Effect.acquireRelease(
            Effect.promise(async () => {
              const response = await SELF.fetch(
                new Request('https://shopping.test/rpc', {
                  headers: { Upgrade: 'websocket' },
                }),
              );
              if (response.status !== 101 || response.webSocket === null) {
                throw new Error(
                  `Shopping Gateway handshake failed with HTTP ${response.status}`,
                );
              }
              response.webSocket.accept();
              return newWebSocketRpcSession<GatewayApi>(response.webSocket);
            }),
            opened => Effect.sync(() => opened[Symbol.dispose]()),
          );
          const devDeployApi = yield* makeAsync(() =>
            gatewayApi.getDevDeployApi(),
          );
          let candidate = yield* makeAsync(() =>
            devDeployApi.startDeploy({ clean: false }),
          ).pipe(
            Effect.flatMap(decodeRpc),
            Effect.flatMap(Schema.decodeUnknown(DeploySnapshotSchema)),
          );
          for (
            let attempt = 0;
            candidate.status === 'activating' && attempt < 100;
            attempt += 1
          ) {
            candidate = yield* makeAsync(() =>
              devDeployApi.getDeploy({ deployId: candidate.deployId }),
            ).pipe(
              Effect.flatMap(decodeRpc),
              Effect.flatMap(Schema.decodeUnknown(DeploySnapshotSchema)),
            );
          }
          expect(candidate).toMatchObject({ status: 'succeeded' });
          expect(candidate.generationId).not.toBe(origin.generationId);

          const generation2State = yield* makeAsync(() =>
            systemRepo.getGenerationState({
              generationId: candidate.generationId,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation2State).toMatchObject({
            admission: 'open',
            prevGenerationId: origin.generationId,
            readiness: 'ready',
          });
          expect(
            generation2State?.activeSystemSpec?.aggregates.shopper?.models
              .cartItem?.version,
          ).toBe('2.0.0');
        }).pipe(Effect.scoped),
      120_000,
    );
  });
});
