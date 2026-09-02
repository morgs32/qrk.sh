import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { env } from 'cloudflare:test';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import { system } from '../fixtures/system.js';

import { getServiceFrontendFinalizedCommandChain } from './getServiceFrontendFinalizedCommandChain/getServiceFrontendFinalizedCommandChain.js';

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory('ServiceFrontendFinalizedCommandChain'),
);

describe('ServiceFrontendFinalizedCommandChain', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'retains one exact terminal command and rejects changed or gapped publication',
      () =>
        Effect.gen(function* () {
          const repo = yield* getServiceFrontendFinalizedCommandChain({
            key: {
              systemId: env.ZEROSPIN_SYSTEM_ID,
              serviceName: 'app',
              userId: 'user_service_frontend_finalized_chain',
              frontendName: 'products',
            },
          });
          const productId = system.services.app.models.product.prefixId(
            'service-frontend-finalized-chain',
          );
          const command = yield* system.services.app.makeCommand({
            contractName: 'createProduct',
            payload: { id: productId, name: 'Finalized chain product' },
          });
          const encoded = yield* encodeCommand({
            contract: system.services.app.contracts.createProduct,
            command,
          });
          const finalized = {
            ...encoded,
            serviceIndex: 1,
            serviceFrontendIndex: 1,
            chainedAt: new Date(1),
            delta: {
              inserted: [],
              updated: [],
              deleted: [],
              mutations: [],
            },
            failedAt: null,
            failure: null,
          };

          yield* makeAsync(() => repo.publishCommand({ command: finalized })).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* makeAsync(() => repo.publishCommand({ command: finalized })).pipe(
            Effect.flatMap(decodeRpc),
          );
          const page = yield* makeAsync(() =>
            repo.getCommands({ afterServiceFrontendIndex: 0 }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(page).toEqual({ commands: [finalized], tip: 1 });

          const changed = yield* makeAsync(() =>
            repo.publishCommand({
              command: { ...finalized, chainedAt: new Date(2) },
            }),
          ).pipe(Effect.flatMap(decodeRpc), Effect.result);
          expect(changed._tag).toBe('Failure');

          const nextCommand = yield* system.services.app.makeCommand({
            contractName: 'createProduct',
            payload: {
              id: system.services.app.models.product.prefixId(
                'service-frontend-finalized-chain-gap',
              ),
              name: 'Gap product',
            },
          });
          const nextEncoded = yield* encodeCommand({
            contract: system.services.app.contracts.createProduct,
            command: nextCommand,
          });
          const gap = yield* makeAsync(() =>
            repo.publishCommand({
              command: {
                ...nextEncoded,
                serviceIndex: 2,
                serviceFrontendIndex: 3,
                chainedAt: new Date(3),
                delta: {
                  inserted: [],
                  updated: [],
                  deleted: [],
                  mutations: [],
                },
                failedAt: null,
                failure: null,
              },
            }),
          ).pipe(Effect.flatMap(decodeRpc), Effect.result);
          expect(gap._tag).toBe('Failure');
        }),
    );
  });
});
