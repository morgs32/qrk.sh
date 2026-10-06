import { afterEach, expect, it } from 'vitest';

import {
  setupShoppingBackend,
  stopShoppingBackend,
} from './support/shoppingBackend';

afterEach(stopShoppingBackend);

it('creates a tracking label for a paid purchase without changing payment state', async () => {
  const backend = await setupShoppingBackend();
  const cart = await backend.seedCart();
  await backend.checkout(backend.makeCheckout(cart));
  const paid = await backend.waitForPurchase(
    cart.purchaseId,
    row => row.paymentState === 'paid',
  );

  expect(
    (await backend.track('createTrackingLabel', cart.purchaseId)).execution,
  ).toMatchObject({
    status: 'succeeded',
    result: { purchaseId: cart.purchaseId, reserved: true },
  });
  const labeled = await backend.waitForPurchase(
    cart.purchaseId,
    row => row.labelState === 'ready',
  );
  expect(labeled).toMatchObject({
    paymentState: 'paid',
    paymentReference: paid.paymentReference,
    paymentEvidence: paid.paymentEvidence,
    total: paid.total,
    trackingStatus: 'pre_transit',
    trackingRefreshSequence: 0,
    trackingRefreshPending: false,
  });
  const labels = (await backend.provider.status()).filter(
    row => row.operation === 'label',
  );
  expect(labels).toHaveLength(1);
  expect(labels[0]).toMatchObject({
    input: {
      purchaseId: cart.purchaseId,
      key: `shopping:${cart.aggregateId}:${cart.purchaseId}:label`,
    },
    calls: 1,
    effects: 1,
    evidence: {
      labelReference: labeled.labelReference,
      trackingNumber: labeled.trackingNumber,
      status: 'pre_transit',
    },
  });
});

it.each(['pending', 'declined'])(
  'rejects tracking labels for pending and declined purchases',
  async paymentState => {
    const backend = await setupShoppingBackend();
    const cart = await backend.seedCart();
    const paymentKey = `shopping:${cart.aggregateId}:${cart.purchaseId}:payment`;
    await backend.provider.configure({
      operation: 'payment',
      key: paymentKey,
      outcome: paymentState === 'declined' ? 'declined' : 'paid',
      pause: paymentState === 'pending',
    });
    await backend.checkout(backend.makeCheckout(cart));
    const purchase = await backend.waitForPurchase(
      cart.purchaseId,
      row => row.paymentState === paymentState,
    );
    if (paymentState === 'pending') {
      await backend.waitFor(
        async () =>
          (await backend.provider.status()).some(
            row => row.key === paymentKey && row.paused,
          ),
        'payment provider barrier',
      );
    }

    await expect(
      backend.track('createTrackingLabel', cart.purchaseId),
    ).rejects.toMatchObject({
      code: 'purchase-not-paid',
    });
    expect((await backend.userRows()).purchases).toEqual([purchase]);
    expect(
      (await backend.provider.status()).filter(
        row => row.operation === 'label',
      ),
    ).toEqual([]);
    if (paymentState === 'pending') {
      await backend.provider.release({ operation: 'payment', key: paymentKey });
      await backend.waitForPurchase(
        cart.purchaseId,
        row => row.paymentState === 'paid',
      );
    }
  },
);

it('coalesces overlapping label requests and reuses the completed label', async () => {
  const backend = await setupShoppingBackend();
  const cart = await backend.seedCart();
  await backend.checkout(backend.makeCheckout(cart));
  await backend.waitForPurchase(
    cart.purchaseId,
    row => row.paymentState === 'paid',
  );
  const labelKey = `shopping:${cart.aggregateId}:${cart.purchaseId}:label`;
  await backend.provider.configure({
    operation: 'label',
    key: labelKey,
    pause: true,
  });

  expect(
    (await backend.track('createTrackingLabel', cart.purchaseId)).execution,
  ).toMatchObject({
    status: 'succeeded',
    result: { reserved: true },
  });
  await backend.waitFor(
    async () =>
      (await backend.provider.status()).some(
        row => row.key === labelKey && row.paused,
      ),
    'label provider barrier',
  );
  const overlapping = await Promise.all([
    backend.track('createTrackingLabel', cart.purchaseId),
    backend.track('createTrackingLabel', cart.purchaseId),
  ]);
  for (const terminal of overlapping) {
    expect(terminal.execution).toMatchObject({
      status: 'succeeded',
      result: { purchaseId: cart.purchaseId, reserved: false },
    });
  }
  expect((await backend.userRows()).purchases[0]?.labelState).toBe('requested');
  await backend.provider.release({ operation: 'label', key: labelKey });
  const labeled = await backend.waitForPurchase(
    cart.purchaseId,
    row => row.labelState === 'ready',
  );

  expect(
    (await backend.track('createTrackingLabel', cart.purchaseId)).execution,
  ).toMatchObject({
    status: 'succeeded',
    result: { reserved: false },
  });
  expect((await backend.userRows()).purchases).toEqual([labeled]);
  const labels = (await backend.provider.status()).filter(
    row => row.operation === 'label',
  );
  expect(labels).toHaveLength(1);
  expect(labels[0]).toMatchObject({ calls: 1, effects: 1 });
});

it('rejects tracking refresh until a label is ready', async () => {
  const backend = await setupShoppingBackend();
  const cart = await backend.seedCart();
  await backend.checkout(backend.makeCheckout(cart));
  await backend.waitForPurchase(
    cart.purchaseId,
    row => row.paymentState === 'paid',
  );

  await expect(
    backend.track('updateTrackingInfo', cart.purchaseId),
  ).rejects.toMatchObject({
    code: 'tracking-label-unavailable',
  });
  const labelKey = `shopping:${cart.aggregateId}:${cart.purchaseId}:label`;
  await backend.provider.configure({
    operation: 'label',
    key: labelKey,
    pause: true,
  });
  await backend.track('createTrackingLabel', cart.purchaseId);
  await backend.waitFor(
    async () =>
      (await backend.provider.status()).some(
        row => row.key === labelKey && row.paused,
      ),
    'requested label provider barrier',
  );
  const before = await backend.userRows();
  await expect(
    backend.track('updateTrackingInfo', cart.purchaseId),
  ).rejects.toMatchObject({
    code: 'tracking-label-unavailable',
  });
  expect((await backend.userRows()).purchases).toEqual(before.purchases);
  expect(
    (await backend.provider.status()).filter(
      row => row.operation === 'tracking',
    ),
  ).toEqual([]);
  await backend.provider.release({ operation: 'label', key: labelKey });
  await backend.waitForPurchase(
    cart.purchaseId,
    row => row.labelState === 'ready',
  );
});

it('coalesces overlapping refresh requests and advances tracking in sequence', async () => {
  const backend = await setupShoppingBackend();
  const cart = await backend.seedCart();
  await backend.checkout(backend.makeCheckout(cart));
  await backend.waitForPurchase(
    cart.purchaseId,
    row => row.paymentState === 'paid',
  );
  await backend.track('createTrackingLabel', cart.purchaseId);
  const labeled = await backend.waitForPurchase(
    cart.purchaseId,
    row => row.labelState === 'ready',
  );

  for (const { sequence, status } of [
    { sequence: 1, status: 'in_transit' },
    { sequence: 2, status: 'delivered' },
  ]) {
    const key = `shopping:${cart.aggregateId}:${cart.purchaseId}:refresh:${sequence}`;
    await backend.provider.configure({
      operation: 'tracking',
      key,
      pause: true,
    });
    expect(
      (await backend.track('updateTrackingInfo', cart.purchaseId)).execution,
    ).toMatchObject({
      status: 'succeeded',
      result: {
        reserved: true,
        sequence,
        labelReference: labeled.labelReference,
      },
    });
    await backend.waitFor(
      async () =>
        (await backend.provider.status()).some(
          row => row.key === key && row.paused,
        ),
      `tracking sequence ${sequence} provider barrier`,
    );
    const overlapping = await Promise.all([
      backend.track('updateTrackingInfo', cart.purchaseId),
      backend.track('updateTrackingInfo', cart.purchaseId),
    ]);
    for (const terminal of overlapping) {
      expect(terminal.execution).toMatchObject({
        status: 'succeeded',
        result: {
          reserved: false,
          sequence,
          labelReference: labeled.labelReference,
        },
      });
    }
    expect((await backend.userRows()).purchases[0]).toMatchObject({
      trackingRefreshSequence: sequence,
      trackingRefreshPending: true,
    });
    await backend.provider.release({ operation: 'tracking', key });
    const refreshed = await backend.waitForPurchase(
      cart.purchaseId,
      row => row.trackingStatus === status && !row.trackingRefreshPending,
    );
    expect(refreshed).toMatchObject({
      labelReference: labeled.labelReference,
      trackingNumber: labeled.trackingNumber,
      paymentState: labeled.paymentState,
      paymentReference: labeled.paymentReference,
      paymentEvidence: labeled.paymentEvidence,
      trackingRefreshSequence: sequence,
    });
    const observation = (await backend.provider.status()).find(
      row => row.key === key,
    );
    expect(observation).toMatchObject({
      calls: 1,
      effects: 1,
      input: {
        purchaseId: cart.purchaseId,
        key,
        labelReference: labeled.labelReference,
        sequence,
      },
      evidence: { status, sequence, labelReference: labeled.labelReference },
    });
  }
  expect(
    (await backend.provider.status()).filter(row => row.operation === 'label'),
  ).toHaveLength(1);
  expect(
    (await backend.provider.status()).filter(
      row => row.operation === 'tracking',
    ),
  ).toHaveLength(2);
});
