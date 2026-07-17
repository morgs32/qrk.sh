import { ZerospinError } from '@zerospin/error';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  makeTraceableRpcTarget,
  renderTraceDag,
  type ITelemetryBatch,
} from '@zerospin/logger';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env, exports as workerExports } from 'cloudflare:workers';
import { Effect, Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import type { AccountBlockRepo } from './AccountBlockRepo.ts';
import type { ActorRepo } from './ActorRepo.ts';
import type { ResetRepo } from './ResetRepo.ts';

describe('finalizeAccountCommands telemetry workflow in workerd', () => {
  it('preserves encoded JSON failures and records the remote span as error', async () => {
    const encodedFailure = Schema.encodeSync(ZerospinError.schema)(
      new ZerospinError({
        code: 'mock-actor-delivery-failure',
        message: 'mock actor delivery failure',
      }),
    );
    const rawActorRepo = env.ACTOR_REPO.getByName('raw-encoded-error');
    await runInDurableObject(rawActorRepo, (_instance: ActorRepo, state) =>
      state.storage.put('failNextActorDelivery', true),
    );

    using rawEnvelope = await rawActorRepo.handleAccountBlocks({
      traceContext: null,
      args: [],
    });
    expect(rawEnvelope.result).toEqual({
      _tag: 'Left',
      left: encodedFailure,
    });
    expect(
      await runInDurableObject(rawActorRepo, (_instance: ActorRepo, state) =>
        state.storage.get('failNextActorDelivery'),
      ),
    ).toBeUndefined();

    const collector = makeTelemetryCollector();
    const wrappedActorRepo = env.ACTOR_REPO.getByName('wrapped-encoded-error');
    await runInDurableObject(wrappedActorRepo, (_instance: ActorRepo, state) =>
      state.storage.put('failNextActorDelivery', true),
    );
    const actorRepo = makeTraceableRpcTarget(wrappedActorRepo);

    const result = await Effect.runPromise(
      actorRepo
        .handleAccountBlocks()
        .pipe(
          Effect.either,
          Effect.withSpan('test.encodedErrorOrigin'),
          Effect.provide(makeTelemetryLayer(collector)),
        ),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error('Expected encoded ActorRepo failure');
    }
    expect(result.left).toEqual(encodedFailure);
    expect(
      await runInDurableObject(
        wrappedActorRepo,
        (_instance: ActorRepo, state) =>
          state.storage.get('failNextActorDelivery'),
      ),
    ).toBeUndefined();
    expect(
      collector
        .flush()
        .spans.find(span => span.name === 'ActorRepo.handleAccountBlocks')
        ?.status,
    ).toBe('error');
  });

  it('crosses Worker and Durable Object RPC boundaries and resumes through alarms', async () => {
    const resetRepo = env.RESET_REPO.getByName('system-worker');
    const accountBlockRepo = env.ACCOUNT_BLOCK_REPO.getByName('account-block');
    const actorRepo = env.ACTOR_REPO.getByName('actor');
    await runInDurableObject(resetRepo, (_instance: ResetRepo, state) =>
      state.storage.put('failNextSystemWorkerRpc', true),
    );
    await runInDurableObject(
      accountBlockRepo,
      (_instance: AccountBlockRepo, state) =>
        state.storage.put('failNextAccountBlockPublish', true),
    );
    await runInDurableObject(actorRepo, (_instance: ActorRepo, state) =>
      state.storage.put('failNextActorDelivery', true),
    );

    const origin = await workerExports.default.finalizeAccountCommands();

    expect(origin.result).toEqual({ executed: 2, failed: 0 });
    expect(
      await runInDurableObject(resetRepo, (_instance: ResetRepo, state) =>
        state.storage.get('failNextSystemWorkerRpc'),
      ),
    ).toBeUndefined();
    expect(
      await runInDurableObject(
        accountBlockRepo,
        (_instance: AccountBlockRepo, state) =>
          state.storage.get('failNextAccountBlockPublish'),
      ),
    ).toBeUndefined();
    expect(
      await runInDurableObject(actorRepo, (_instance: ActorRepo, state) =>
        state.storage.get('failNextActorDelivery'),
      ),
    ).toBe(true);

    expect(await runDurableObjectAlarm(accountBlockRepo)).toBe(true);
    expect(
      await runInDurableObject(actorRepo, (_instance: ActorRepo, state) =>
        state.storage.get('subscriberDeliveryAttempts'),
      ),
    ).toBe(1);
    expect(
      await runInDurableObject(actorRepo, (_instance: ActorRepo, state) =>
        state.storage.get('failNextActorDelivery'),
      ),
    ).toBeUndefined();

    expect(await runDurableObjectAlarm(accountBlockRepo)).toBe(true);
    expect(
      await runInDurableObject(actorRepo, (_instance: ActorRepo, state) =>
        state.storage.get('subscriberDeliveryAttempts'),
      ),
    ).toBe(2);

    const alarmTelemetry = await runInDurableObject(
      accountBlockRepo,
      (_instance: AccountBlockRepo, state) =>
        state.storage.get<ITelemetryBatch[]>('alarmTelemetry'),
    );
    expect(alarmTelemetry).toHaveLength(2);

    const drainTelemetry = alarmTelemetry?.[0];
    const retryTelemetry = alarmTelemetry?.[1];
    if (drainTelemetry === undefined || retryTelemetry === undefined) {
      throw new Error('Expected drain and retry alarm telemetry');
    }

    const workflowCollector = makeTelemetryCollector();
    workflowCollector.merge(origin.telemetry);
    workflowCollector.merge(drainTelemetry);
    workflowCollector.merge(retryTelemetry);
    const workflowBatch = workflowCollector.flush();

    expect(new Set(workflowBatch.spans.map(span => span.traceId)).size).toBe(3);
    expect(
      workflowBatch.spans.filter(span => span.status === 'lost'),
    ).toHaveLength(1);
    expect(
      workflowBatch.spans
        .filter(span => span.name === 'AccountBlockRepo.publish')
        .map(span => span.status)
        .sort(),
    ).toEqual(['error', 'ok']);
    expect(
      workflowBatch.spans
        .filter(span => span.name === 'ActorRepo.handleAccountBlocks')
        .map(span => span.status)
        .sort(),
    ).toEqual(['error', 'ok']);
    expect(workflowBatch.links.map(link => link.kind)).toEqual([
      'causedBy',
      'retryOf',
    ]);

    expect(renderTraceDag(workflowBatch)).toMatchInlineSnapshot(`
      "trace T1
      └─ T1.1 SystemApi.finalizeAccountCommands [ok]
         ├─ T1.2 finalizeAccountBlock [lost]
         └─ T1.3 SystemWorker.finalizeAccountBlock [ok]
            ├· [info] system worker finalize started
            ├· [info] system worker finalize succeeded
            └─ T1.4 AccountRepo.finalizeAccountBlock [ok]
               ├· [info] finalizing 2 account commands
               ├─ T1.5 AccountRepo.prepareAccountCommands [ok]
               ├─ T1.6 AccountRepo.finalizeAccountBlock.transaction [ok]
               │  ├─ T1.7 AccountRepo.finalizeCommandsTx [ok]
               │  ├─ T1.8 AccountRepo.makeAccountBlockTx [ok]
               │  └─ T1.9 AccountRepo.upsertAccountBlockTx [ok]
               ├─ T1.10 AccountRepo.publishAccountBlock [ok]
               │  ├─ T1.11 AccountBlockRepo.publish [error]
               │  │  └· [info] publish attempt 1
               │  └─ T1.12 AccountBlockRepo.publish [ok]
               │     └· [info] publish attempt 2
               └─ T1.13 AccountRepo.upsertAccountBlock [ok]

      trace T2
      └─ T2.1 AccountBlockRepo.drainActorOutbox [ok]
         ├· [info] drain started
         ├─ T2.2 AccountBlockRepo.refreshQueue [ok]
         └─ T2.3 AccountBlockRepo.processSubscriber [ok]
            ├· [warn] actor delivery failed; retry scheduled for 500ms
            └─ T2.4 ActorRepo.handleAccountBlocks [error]

      trace T3
      └─ T3.1 AccountBlockRepo.alarm [ok]
         ├· [info] alarm fired
         └─ T3.2 AccountBlockRepo.drainActorOutbox [ok]
            ├─ T3.3 AccountBlockRepo.refreshQueue [ok]
            └─ T3.4 AccountBlockRepo.processSubscriber [ok]
               └─ T3.5 ActorRepo.handleAccountBlocks [ok]
                  └· [info] actor delivery succeeded

      links
      ├─ T1.12 AccountBlockRepo.publish [ok] ─causedBy→ T2.1 AccountBlockRepo.drainActorOutbox [ok]
      └─ T2.3 AccountBlockRepo.processSubscriber [ok] ─retryOf→ T3.1 AccountBlockRepo.alarm [ok]"
    `);
  });
});
