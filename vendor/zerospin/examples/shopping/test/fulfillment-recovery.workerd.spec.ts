import { abortAllDurableObjects, runDurableObjectAlarm } from 'cloudflare:test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  setupShoppingBackend,
  stopShoppingBackend,
} from './support/shoppingBackend';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 3_600_000);
});

afterEach(async () => {
  try {
    await stopShoppingBackend();
  } finally {
    vi.useRealTimers();
  }
});

it('resumes payment after object restart using the original input and business key', async () => {
  const backend = await setupShoppingBackend();
  const cart = await backend.seedCart();
  const key = `shopping:${cart.aggregateId}:${cart.purchaseId}:payment`;

  // 1 — Retain provider evidence while the original payment response is withheld.
  await backend.provider.configure({ operation: 'payment', key, pause: true });
  const checkout = backend.makeCheckout(cart);
  const terminal = await backend.checkout(checkout);
  await backend.waitFor(
    async () =>
      (await backend.provider.status()).some(
        row => row.key === key && row.paused,
      ),
    'payment provider barrier',
  );
  await backend.waitFor(
    async () =>
      (await backend.marketplaceRows()).work.some(
        row =>
          row.asyncContractName === 'asyncCreatePurchase' &&
          row.responseRecordedAt !== null &&
          row.nextRunAt === null,
      ),
    'completed purchase transfer before payment interruption',
  );
  const before = await backend.userRows();
  const work = before.work.find(
    row => row.asyncContractName === 'asyncProcessPayment',
  );
  if (work?.nextRunAt == null) {
    throw new Error('Payment must retain its recovery deadline');
  }
  expect(before.purchases[0]?.paymentState).toBe('pending');
  expect(work.payload).toEqual({ purchaseId: cart.purchaseId, key, total: 40 });
  expect(work.responseRecordedAt).toBeNull();
  expect(work.response).toBeNull();
  expect(work.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  expect(
    (await backend.provider.status()).find(row => row.key === key),
  ).toMatchObject({
    input: work.payload,
    calls: 1,
    effects: 1,
    paused: true,
    evidence: { key, state: 'paid' },
  });

  // 2 — Reactivation before that deadline retains the exact original work.
  await abortAllDurableObjects();
  expect((await backend.userRows()).work).toEqual(before.work);
  expect(
    (await backend.provider.status()).find(row => row.key === key)?.calls,
  ).toBe(1);

  // 3 — The registered alarm retries the same business effect and commits its evidence.
  vi.setSystemTime(work.nextRunAt.getTime() + 1);
  expect(await runDurableObjectAlarm(backend.owner('user'))).toBe(true);
  const paid = await backend.waitForPurchase(
    cart.purchaseId,
    row => row.paymentState === 'paid',
  );
  const after = await backend.userRows();
  expect(after.purchases).toHaveLength(1);
  expect(after.items).toEqual(before.items);
  expect(
    after.work.find(row => row.asyncCommandId === work.asyncCommandId),
  ).toMatchObject({
    payload: work.payload,
    actorName: work.actorName,
    actorVersion: work.actorVersion,
    claims: work.claims,
    nextRunAt: null,
    response: {
      key,
      state: 'paid',
      reference: paid.paymentReference,
      evidence: paid.paymentEvidence,
    },
  });
  expect(
    after.commands.find(row => row.id === work.asyncCommandId)?.response,
  ).toEqual({
    key,
    state: 'paid',
    reference: paid.paymentReference,
    evidence: paid.paymentEvidence,
  });
  const payment = (await backend.provider.status()).find(
    row => row.key === key,
  );
  expect(payment).toMatchObject({ operation: 'payment', effects: 1 });
  expect(payment?.calls).toBeGreaterThanOrEqual(2);
  expect(payment?.inputs).toHaveLength(payment?.calls ?? 0);
  for (const input of payment?.inputs ?? []) {
    expect(input).toEqual(work.payload);
  }
  const effectsBeforeRetry = await backend.provider.status();
  expect(
    effectsBeforeRetry.filter(row => row.operation === 'payment'),
  ).toHaveLength(1);
  expect(await backend.checkout(checkout)).toEqual(terminal);
  expect((await backend.userRows()).purchases).toEqual(after.purchases);
  expect((await backend.userRows()).items).toEqual(after.items);
  expect(await backend.provider.status()).toEqual(effectsBeforeRetry);
});

it('resumes label creation after object restart using the original input and business key', async () => {
  const backend = await setupShoppingBackend();
  const cart = await backend.seedCart();
  await backend.checkout(backend.makeCheckout(cart));
  const paid = await backend.waitForPurchase(
    cart.purchaseId,
    row => row.paymentState === 'paid',
  );
  await backend.waitFor(
    async () =>
      (await backend.marketplaceRows()).work.some(
        row =>
          row.asyncContractName === 'asyncCreatePurchase' &&
          row.responseRecordedAt !== null &&
          row.nextRunAt === null,
      ),
    'completed purchase transfer before label interruption',
  );
  const key = `shopping:${cart.aggregateId}:${cart.purchaseId}:label`;

  // 1 — Commit one label effect, then interrupt before the owner receives it.
  await backend.provider.configure({ operation: 'label', key, pause: true });
  const request = backend.makeTrackingCommand(
    'createTrackingLabel',
    cart.purchaseId,
  );
  const terminal = await backend.executeTracking(request);
  await backend.waitFor(
    async () =>
      (await backend.provider.status()).some(
        row => row.key === key && row.paused,
      ),
    'label provider barrier',
  );
  const before = await backend.userRows();
  const work = before.work.find(
    row => row.asyncContractName === 'asyncCreateTrackingLabel',
  );
  if (work?.nextRunAt == null) {
    throw new Error('Label creation must retain its recovery deadline');
  }
  expect(before.purchases[0]?.labelState).toBe('requested');
  expect(work.payload).toEqual({ purchaseId: cart.purchaseId, key });
  expect(work.responseRecordedAt).toBeNull();
  expect(work.response).toBeNull();
  expect(work.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  expect(
    (await backend.provider.status()).find(row => row.key === key),
  ).toMatchObject({
    input: work.payload,
    calls: 1,
    effects: 1,
    paused: true,
    evidence: { key, status: 'pre_transit' },
  });

  // 2 — Object replacement keeps storage and does not retry before the deadline.
  await abortAllDurableObjects();
  expect((await backend.userRows()).work).toEqual(before.work);
  expect(
    (await backend.provider.status()).find(row => row.key === key)?.calls,
  ).toBe(1);

  // 3 — Recovery reconciles the original label and leaves payment unchanged.
  vi.setSystemTime(work.nextRunAt.getTime() + 1);
  expect(await runDurableObjectAlarm(backend.owner('user'))).toBe(true);
  const labeled = await backend.waitForPurchase(
    cart.purchaseId,
    row => row.labelState === 'ready',
  );
  expect(labeled).toMatchObject({
    paymentState: 'paid',
    paymentReference: paid.paymentReference,
    paymentEvidence: paid.paymentEvidence,
    trackingStatus: 'pre_transit',
  });
  const after = await backend.userRows();
  expect(after.purchases).toHaveLength(1);
  expect(after.items).toEqual(before.items);
  expect(
    after.work.find(row => row.asyncCommandId === work.asyncCommandId),
  ).toMatchObject({
    payload: work.payload,
    actorName: work.actorName,
    actorVersion: work.actorVersion,
    claims: work.claims,
    nextRunAt: null,
    response: {
      key,
      labelReference: labeled.labelReference,
      trackingNumber: labeled.trackingNumber,
    },
  });
  expect(
    after.commands.find(row => row.id === work.asyncCommandId)?.response,
  ).toEqual({
    key,
    labelReference: labeled.labelReference,
    trackingNumber: labeled.trackingNumber,
    status: 'pre_transit',
  });
  const label = (await backend.provider.status()).find(row => row.key === key);
  expect(label).toMatchObject({ operation: 'label', effects: 1 });
  expect(label?.calls).toBeGreaterThanOrEqual(2);
  expect(label?.inputs).toHaveLength(label?.calls ?? 0);
  for (const input of label?.inputs ?? []) {
    expect(input).toEqual(work.payload);
  }
  const effectsBeforeRetry = await backend.provider.status();
  expect(
    effectsBeforeRetry.filter(row => row.operation === 'label'),
  ).toHaveLength(1);
  expect(
    effectsBeforeRetry.filter(row => row.operation === 'payment'),
  ).toHaveLength(1);
  expect(await backend.executeTracking(request)).toEqual(terminal);
  expect((await backend.userRows()).purchases).toEqual(after.purchases);
  expect((await backend.userRows()).items).toEqual(after.items);
  expect(await backend.provider.status()).toEqual(effectsBeforeRetry);
});

it('resumes checkout transfer after object restart without consuming later cart additions', async () => {
  const backend = await setupShoppingBackend();
  const cart = await backend.seedCart();

  // 1 — Withhold delivery after checkout commits its immutable transfer payload.
  await backend.provider.configure({
    operation: 'transfer-before',
    key: cart.purchaseId,
    pause: true,
  });
  const terminal = await backend.checkout(backend.makeCheckout(cart));
  expect(terminal.execution.status).toBe('succeeded');
  await backend.waitFor(
    async () =>
      (await backend.provider.status()).some(
        row => row.operation === 'transfer-before' && row.paused,
      ),
    'purchase delivery barrier before administrative execution',
  );
  const before = await backend.marketplaceRows();
  const work = before.work.find(
    row => row.asyncContractName === 'asyncCreatePurchase',
  );
  if (work?.nextRunAt == null) {
    throw new Error('Purchase transfer must retain its recovery deadline');
  }
  if (terminal.execution.status !== 'succeeded') {
    throw new Error('Checkout must succeed before delivery');
  }
  expect(work.payload).toEqual({
    aggregateId: cart.aggregateId,
    quote: JSON.stringify(terminal.execution.result),
  });
  expect(work.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  expect(before.cartItems).toEqual([]);
  expect((await backend.userRows()).purchases).toEqual([]);
  const laterItemId = await backend.addLaterItem(cart, { amount: 3 });

  // 2 — The service owner recovers the frozen transfer while retaining later additions.
  await abortAllDurableObjects();
  expect((await backend.marketplaceRows()).work).toEqual(before.work);
  expect(
    (await backend.provider.status()).find(
      row => row.operation === 'transfer-before',
    )?.calls,
  ).toBe(1);
  vi.setSystemTime(work.nextRunAt.getTime() + 1);
  expect(await runDurableObjectAlarm(backend.owner('marketplace'))).toBe(true);
  const purchase = await backend.waitForPurchase(
    cart.purchaseId,
    row => row.paymentState === 'paid',
  );
  expect(purchase.total).toBe(40);
  const user = await backend.userRows();
  expect(user.purchases).toHaveLength(1);
  expect(user.items).toMatchObject([
    {
      purchaseId: cart.purchaseId,
      productId: cart.productId,
      name: cart.product.name,
      price: 20,
      quantity: 2,
    },
  ]);
  expect((await backend.marketplaceRows()).cartItems).toMatchObject([
    { id: laterItemId, cartId: cart.cartId, amount: 3 },
  ]);
  await backend.waitFor(
    async () =>
      (await backend.marketplaceRows()).work.some(
        row =>
          row.asyncCommandId === work.asyncCommandId &&
          row.responseRecordedAt !== null,
      ),
    'transfer result recording',
  );
  const recovered = (await backend.marketplaceRows()).work.find(
    row => row.asyncCommandId === work.asyncCommandId,
  );
  expect(recovered).toMatchObject({ payload: work.payload, nextRunAt: null });
  const observations = await backend.provider.status();
  const transfer = observations.find(
    row => row.operation === 'transfer-before',
  );
  expect(transfer?.calls).toBeGreaterThanOrEqual(2);
  expect(transfer?.inputs).toHaveLength(transfer?.calls ?? 0);
  for (const input of transfer?.inputs ?? []) {
    expect(input).toEqual(transfer?.input);
  }
  expect(observations.filter(row => row.operation === 'payment')).toMatchObject(
    [{ effects: 1 }],
  );
});

it('retries purchase delivery after response loss with the identical complete command', async () => {
  const backend = await setupShoppingBackend();
  const cart = await backend.seedCart();

  // 1 — Lose only the transfer response after its real administrative command succeeds.
  await backend.provider.configure({
    operation: 'transfer-after',
    key: cart.purchaseId,
    pause: true,
  });
  const terminal = await backend.checkout(backend.makeCheckout(cart));
  expect(terminal.execution.status).toBe('succeeded');
  await backend.waitFor(
    async () =>
      (await backend.provider.status()).some(
        row => row.operation === 'transfer-after' && row.paused,
      ),
    'purchase delivery barrier after administrative execution',
  );
  await backend.waitForPurchase(
    cart.purchaseId,
    row => row.paymentState === 'paid',
  );
  const userBefore = await backend.userRows();
  const marketBefore = await backend.marketplaceRows();
  const work = marketBefore.work.find(
    row => row.asyncContractName === 'asyncCreatePurchase',
  );
  if (work?.nextRunAt == null) {
    throw new Error('Lost transfer response must retain its recovery deadline');
  }
  expect(work.responseRecordedAt).toBeNull();
  expect(work.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  const original = (await backend.provider.status()).find(
    row => row.operation === 'transfer-before',
  );
  expect(original?.input).toMatchObject({
    id: `cmd_purchase_${cart.purchaseId.slice(4)}`,
    commandName: 'createPurchase',
    contractVersion: '1.0.0',
    payload: expect.any(String),
    systemName: 'shopping',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
    aggregateId: cart.aggregateId,
    actorName: 'admin',
    actorVersion: '1.0.0',
    claims: { aggregateId: cart.aggregateId },
    nodeId: null,
    nodeIndex: null,
    sessionName: null,
  });

  // 2 — The retained transfer retries through the same SystemApi command boundary.
  await abortAllDurableObjects();
  expect((await backend.marketplaceRows()).work).toEqual(marketBefore.work);
  expect((await backend.userRows()).purchases).toEqual(userBefore.purchases);
  vi.setSystemTime(work.nextRunAt.getTime() + 1);
  expect(await runDurableObjectAlarm(backend.owner('marketplace'))).toBe(true);
  await backend.waitFor(
    async () =>
      (await backend.marketplaceRows()).work.some(
        row =>
          row.asyncCommandId === work.asyncCommandId &&
          row.responseRecordedAt !== null,
      ),
    'retried transfer result recording',
  );

  // 3 — Complete command equality preserves the unique purchase and charge.
  const observations = await backend.provider.status();
  for (const operation of ['transfer-before', 'transfer-after']) {
    const transfer = observations.find(row => row.operation === operation);
    expect(transfer?.calls).toBeGreaterThanOrEqual(2);
    expect(transfer?.inputs).toHaveLength(transfer?.calls ?? 0);
    for (const input of transfer?.inputs ?? []) {
      expect(input).toEqual(original?.input);
    }
  }
  expect(
    observations.filter(row => row.operation === 'transfer-after'),
  ).toMatchObject([{ effects: 1 }]);
  expect(observations.filter(row => row.operation === 'payment')).toMatchObject(
    [{ calls: 1, effects: 1 }],
  );
  const userAfter = await backend.userRows();
  expect(userAfter.purchases).toEqual(userBefore.purchases);
  expect(userAfter.items).toEqual(userBefore.items);
  expect(userAfter.purchases).toHaveLength(1);
  expect(userAfter.items).toHaveLength(1);
  expect((await backend.marketplaceRows()).cartItems).toEqual([]);
});
