/*
 * Integration spec imitating SystemApi.finalizeAccountCommands topology with
 * mock RpcTargets only — no system-worker, Cloudflare, or databases.
 */

import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  renderTraceDag,
  type ITelemetryBatch,
} from '@zerospin/logger';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { harness, queuedJobs, resetFinalizeHarness } from './queuedJobs.ts';
import { finalizeAccountCommands } from './SystemApi.ts';

describe('finalizeAccountCommands telemetry workflow', () => {
  it('captures transport loss, RPC retries, delayed drain, and alarm retry as one DAG', async () => {
    resetFinalizeHarness();
    harness.failNextSystemWorkerRpc = true;
    harness.failNextAccountBlockPublish = true;
    harness.failNextActorDelivery = true;

    const originCollector = makeTelemetryCollector();
    const result = await Effect.runPromise(
      finalizeAccountCommands.pipe(
        Effect.provide(makeTelemetryLayer(originCollector)),
      ),
    );
    expect(result).toEqual({ executed: 2, failed: 0 });
    expect(harness.systemWorkerRpcAttempts).toBe(2);
    expect(harness.accountBlockPublishAttempts).toBe(2);
    expect(harness.failNextSystemWorkerRpc).toBe(false);
    expect(harness.failNextAccountBlockPublish).toBe(false);
    expect(harness.failNextActorDelivery).toBe(true);

    const originBatch = originCollector.flush();
    expect(queuedJobs).toHaveLength(1);
    expect(queuedJobs[0]?.name).toBe('drain');
    expect(queuedJobs[0]?.delayMs).toBe(0);
    expect(harness.subscriberDeliveryAttempts).toBe(0);

    const drainJob = queuedJobs.shift();
    if (drainJob === undefined) {
      throw new Error('Expected a delayed drain job');
    }
    const drainEnvelope = await drainJob.run();
    expect(drainEnvelope.result._tag).toBe('Right');
    expect(harness.subscriberDeliveryAttempts).toBe(1);
    expect(harness.failNextActorDelivery).toBe(false);
    expect(queuedJobs).toHaveLength(1);
    expect(queuedJobs[0]?.name).toBe('alarm');
    expect(queuedJobs[0]?.delayMs).toBe(500);

    const alarmJob = queuedJobs.shift();
    if (alarmJob === undefined) {
      throw new Error('Expected a delayed alarm job');
    }
    const alarmEnvelope = await alarmJob.run();
    expect(alarmEnvelope.result._tag).toBe('Right');
    expect(harness.subscriberDeliveryAttempts).toBe(2);
    expect(harness.failNextActorDelivery).toBe(false);
    expect(queuedJobs).toEqual([]);

    const workflowCollector = makeTelemetryCollector();
    workflowCollector.merge(originBatch);
    workflowCollector.merge(drainEnvelope.telemetry);
    workflowCollector.merge(alarmEnvelope.telemetry);
    const workflowBatch: ITelemetryBatch = workflowCollector.flush();

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
