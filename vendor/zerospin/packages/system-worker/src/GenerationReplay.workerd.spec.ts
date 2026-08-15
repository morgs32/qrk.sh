import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { TraceLoggerLayer } from '@zerospin/core/test-utils/TraceLoggerLayer';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { env, runInDurableObject } from 'cloudflare:test';
import { Effect, Layer } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AggregateRepo } from './AggregateRepo/AggregateRepo.js';
import { getAggregateRepo } from './AggregateRepo/getAggregateRepo/getAggregateRepo.js';
import { main, system } from './fixtures/system.js';
import { managedRuntime } from './managedRuntime.js';
import { SystemRepo } from './SystemRepo/SystemRepo.js';
import { executeInRepo } from './workerd-utils/executeInRepo.js';
import { prepareGenerationStateFixture } from './workerd-utils/prepareGenerationStateFixture.js';

describe('SystemRepo linked generation replay', () => {
  it.layer(
    Layer.mergeAll(
      AsyncLive,
      makePrefixedIncrementalIdFactory('generation-replay'),
      ErrorLayer,
      TraceLoggerLayer,
      TestContext,
    ),
  )(it => {
    it.effect('replays the frozen owner ledger before linked promotion', () =>
      Effect.gen(function* () {
        const source = yield* prepareGenerationStateFixture({
          clean: false,
          workerVersionId: 'generation-replay-source',
        });
        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        const aggregate = system.aggregates.user;
        const aggregateId = makeAggregateId({ id: 'generation-replay' });
        const userId = aggregate.models.user.prefixId('generation-replay');
        const command = yield* aggregate.makeCommand({
          contractName: 'createUser',
          aggregateId,
          systemName: system.name,
          payload: { id: userId, name: 'Generation replay user' },
        });
        const encodedCommand = yield* encodeCommand({
          contract: aggregate.contracts.createUser,
          command,
        });
        yield* makeAsync(() =>
          systemRepo.finalizeAggregateCommands({
            aggregateId,
            aggregateName: main.aggregateName,
            commands: [encodedCommand],
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const nextSystemSpec = makeSystemSpec({ system });
        const priorSystemSpec = structuredClone(nextSystemSpec);
        priorSystemSpec.version = '0.9.0';
        Reflect.deleteProperty(priorSystemSpec.services, 'inventory');
        yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => {
            const encodedPriorSystemSpec = JSON.stringify(priorSystemSpec);
            state.storage.sql.exec(
              'UPDATE deploy SET systemSpec = ? WHERE id = ?',
              encodedPriorSystemSpec,
              source.deployId,
            );
            state.storage.sql.exec(
              'UPDATE generationState SET activeSystemSpec = ? WHERE generationId = ?',
              encodedPriorSystemSpec,
              source.generationId,
            );
          }),
        );

        const target = yield* prepareGenerationStateFixture({
          clean: false,
          workerVersionId: 'generation-replay-target',
        });
        expect(target.generationId).not.toBe(source.generationId);
        expect(target.activationCheckpoint).toBe('final-replay-complete');

        const users = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateRepo,
            repo: AggregateRepo,
            key: {
              generationId: target.generationId,
              aggregateId,
              aggregateName: main.aggregateName,
            },
            fn: ({ db, schema }) =>
              db.select().from(schema.user).orderBy(schema.user.id).all(),
          }),
        );
        expect(users).toContainEqual(
          expect.objectContaining({
            id: userId,
            name: 'Generation replay user',
          }),
        );

        const receipts = yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => ({
            sourceBound: state.storage.sql
              .exec<{ terminalIndex: number | null }>(
                "SELECT terminalIndex FROM drainBounds WHERE generationId = ? AND repoType = 'AggregateBlockRepo'",
                source.generationId,
              )
              .one(),
            targetCompletion: state.storage.sql
              .exec<{ blockCount: number; terminalIndex: number | null }>(
                "SELECT blockCount, terminalIndex FROM replayCompletions WHERE generationId = ? AND repoType = 'AggregateRepo'",
                target.generationId,
              )
              .one(),
          })),
        );
        expect(receipts.sourceBound.terminalIndex).toBe(1);
        expect(receipts.targetCompletion).toEqual({
          blockCount: 1,
          terminalIndex: 1,
        });
      }),
    );
  });
});
