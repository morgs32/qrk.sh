import {
  abortAllDurableObjects,
  env,
  runDurableObjectAlarm,
} from 'cloudflare:test';
import { expect, expectTypeOf, it } from 'vitest';

it('redelivers a committed page through real RpcTargets after cold activation and an alarm', async () => {
  const senderId = env.OUTBOX_SENDER_FIXTURE.idFromName('outbox-cold-retry');
  let sender = env.OUTBOX_SENDER_FIXTURE.get(senderId);
  let receiver = env.OUTBOX_RECEIVER_FIXTURE.getByName(senderId.toString());
  await sender.seed(130);
  await receiver.setResponseLoss(true);
  expect(await sender.drain()).toBe('Failure');
  const before = await sender.inspect();
  expect(before.rows).toHaveLength(130);
  expect(before.alarm).not.toBeNull();
  expect(before.rows[0]?.lastDeliveryFailure).toContain('response-lost');
  expect((await receiver.inspect()).rows).toHaveLength(64);
  await receiver.setResponseLoss(false);
  await abortAllDurableObjects();
  sender = env.OUTBOX_SENDER_FIXTURE.get(senderId);
  receiver = env.OUTBOX_RECEIVER_FIXTURE.getByName(senderId.toString());
  await runDurableObjectAlarm(sender);
  const received = await receiver.inspect();
  expect(received.rows.map(row => row.outboxIndex)).toEqual(
    Array.from({ length: 130 }, (_, index) => index + 1),
  );
  expect(received.pages.map(page => page.length)).toEqual([
    64, 64, 64, 64, 64, 2,
  ]);
  expect(received.pages[3]).toEqual(received.pages[0]);
  expect((await sender.inspect()).rows).toEqual([]);
  expect((await sender.inspect()).alarm).toBeNull();
});

it('keeps the sender table row in the receiver contract', () => {
  expectTypeOf<
    Parameters<
      import('../makeOutboxSubscriber/makeOutboxSubscriber.js').IOutboxSubscriberRepo<
        import('../workerd-utils/OutboxFixture.js').OutboxSenderFixture['output']
      >['outputSubscriber']['receive']
    >[0]
  >().toEqualTypeOf<
    Parameters<
      import('../workerd-utils/OutboxFixture.js').OutboxReceiverFixture['outputSubscriber']['receive']
    >[0]
  >();
});
