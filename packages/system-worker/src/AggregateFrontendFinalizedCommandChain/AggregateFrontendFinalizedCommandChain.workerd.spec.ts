import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { env } from 'cloudflare:test';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import { main, system } from '../fixtures/system.js';

import { getAggregateFrontendFinalizedCommandChain } from './getAggregateFrontendFinalizedCommandChain/getAggregateFrontendFinalizedCommandChain.js';

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory(
    'AggregateFrontendFinalizedCommandChain',
  ),
);

describe('AggregateFrontendFinalizedCommandChain', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'retains one exact terminal command and rejects changed or gapped publication',
      () =>
        Effect.gen(function* () {
          const aggregateId = makeAggregateId({
            id: 'aggregate-frontend-finalized-chain',
          });
          const userId = system.aggregates.user.models.user.prefixId(
            'aggregate-frontend-finalized-chain',
          );
          const repo = yield* getAggregateFrontendFinalizedCommandChain({
            key: {
              systemId: env.ZEROSPIN_SYSTEM_ID,
              aggregateId,
              aggregateName: main.aggregateName,
              userId,
              frontendName: main.frontendName,
            },
          });
          const command = yield* system.aggregates.user.makeCommand({
            contractName: 'createUser',
            aggregateId,
            systemName: system.name,
            payload: { id: userId, name: 'Finalized chain user' },
          });
          const encoded = yield* encodeCommand({
            contract: system.aggregates.user.contracts.createUser,
            command,
          });
          const finalized = {
            ...encoded,
            aggregateIndex: 1,
            frontendIndex: 1,
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
            repo.getCommands({ afterFrontendIndex: 0 }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(page).toEqual({ commands: [finalized], tip: 1 });

          const changed = yield* makeAsync(() =>
            repo.publishCommand({
              command: { ...finalized, chainedAt: new Date(2) },
            }),
          ).pipe(Effect.flatMap(decodeRpc), Effect.result);
          expect(changed._tag).toBe('Failure');

          const nextCommand = yield* system.aggregates.user.makeCommand({
            contractName: 'createUser',
            aggregateId,
            systemName: system.name,
            payload: {
              id: system.aggregates.user.models.user.prefixId(
                'aggregate-frontend-finalized-chain-gap',
              ),
              name: 'Gap user',
            },
          });
          const nextEncoded = yield* encodeCommand({
            contract: system.aggregates.user.contracts.createUser,
            command: nextCommand,
          });
          const gap = yield* makeAsync(() =>
            repo.publishCommand({
              command: {
                ...nextEncoded,
                aggregateIndex: 2,
                frontendIndex: 3,
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
