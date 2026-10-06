import { afterEach, expect, it } from 'vitest';

import {
  setupShoppingBackend,
  stopShoppingBackend,
} from './support/shoppingBackend';

afterEach(stopShoppingBackend);

it('checks out authoritative cart items and automatically pays the frozen purchase', async () => {
  const backend = await setupShoppingBackend();
  const cart = await backend.seedCart();
  const quote = {
    purchaseId: cart.purchaseId,
    total: cart.product.price * cart.amount,
    items: [
      {
        id: `pit_${cart.purchaseId.slice(4)}_${cart.cartItemId.slice(4)}`,
        productId: cart.productId,
        name: cart.product.name,
        price: cart.product.price,
        quantity: cart.amount,
      },
    ],
  };

  const terminal = await backend.checkout(backend.makeCheckout(cart));
  expect(terminal.execution).toMatchObject({
    status: 'succeeded',
    result: quote,
  });
  const purchase = await backend.waitForPurchase(
    cart.purchaseId,
    row => row.paymentState === 'paid',
  );
  expect(purchase.total).toBe(40);
  expect(purchase.paymentReference).toBeTruthy();
  expect(purchase.paymentEvidence).toBeTruthy();

  const marketplace = await backend.marketplaceRows();
  expect(marketplace.cartItems).toEqual([]);
  const user = await backend.userRows();
  expect(user.purchases).toHaveLength(1);
  expect(user.items).toHaveLength(1);
  expect(user.items[0]).toMatchObject({
    ...quote.items[0],
    purchaseId: cart.purchaseId,
  });

  const provider = await backend.provider.status();
  const payments = provider.filter(row => row.operation === 'payment');
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({
    input: {
      purchaseId: cart.purchaseId,
      key: `shopping:${cart.aggregateId}:${cart.purchaseId}:payment`,
      total: quote.total,
    },
    calls: 1,
    effects: 1,
    evidence: {
      state: 'paid',
      reference: purchase.paymentReference,
      evidence: purchase.paymentEvidence,
    },
  });
});

it('retrying the same checkout command preserves the purchase and later cart additions', async () => {
  const backend = await setupShoppingBackend();
  const cart = await backend.seedCart();
  const command = backend.makeCheckout(cart);
  const original = await backend.checkout(command);
  await backend.waitForPurchase(
    cart.purchaseId,
    row => row.paymentState === 'paid',
  );
  const before = await backend.userRows();
  const laterItemId = await backend.addLaterItem(cart, { amount: 3 });

  expect(await backend.checkout(command)).toEqual(original);
  const after = await backend.userRows();
  expect(after.purchases).toEqual(before.purchases);
  expect(after.items).toEqual(before.items);
  expect(after.purchases).toHaveLength(1);
  expect(after.items).toHaveLength(1);
  expect((await backend.marketplaceRows()).cartItems).toMatchObject([
    { id: laterItemId, cartId: cart.cartId, amount: 3 },
  ]);
  const payments = (await backend.provider.status()).filter(
    row => row.operation === 'payment',
  );
  expect(payments).toHaveLength(1);
  expect(payments[0]?.calls).toBe(1);
});

it('declined payment retains the purchase and items without restoring the cart', async () => {
  const backend = await setupShoppingBackend();
  const cart = await backend.seedCart();
  await backend.provider.configure({
    operation: 'payment',
    key: `shopping:${cart.aggregateId}:${cart.purchaseId}:payment`,
    outcome: 'declined',
  });
  expect(
    (await backend.checkout(backend.makeCheckout(cart))).execution.status,
  ).toBe('succeeded');

  const purchase = await backend.waitForPurchase(
    cart.purchaseId,
    row => row.paymentState === 'declined',
  );
  expect(purchase).toMatchObject({
    total: 40,
    paymentState: 'declined',
    labelState: 'none',
  });
  expect(purchase.paymentReference).toBeTruthy();
  expect(purchase.paymentEvidence).toBeTruthy();
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
  expect((await backend.marketplaceRows()).cartItems).toEqual([]);
  const payments = (await backend.provider.status()).filter(
    row => row.operation === 'payment',
  );
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({
    operation: 'payment',
    effects: 1,
    evidence: { state: 'declined' },
  });
});

it("rejects checkout of another shopper's cart without creating a purchase or payment", async () => {
  const backend = await setupShoppingBackend();
  const cart = await backend.seedCart({ subject: 'user_bob' });
  const before = await backend.marketplaceRows();
  const terminal = await backend.checkout(
    backend.makeCheckout(cart, { subject: 'user_alice' }),
  );

  expect(terminal.execution).toMatchObject({
    status: 'failed',
    failure: { code: 'checkout-cart-unavailable' },
  });
  expect((await backend.marketplaceRows()).cartItems).toEqual(before.cartItems);
  expect((await backend.userRows('user_alice')).purchases).toEqual([]);
  expect((await backend.userRows('user_bob')).purchases).toEqual([]);
  expect(await backend.provider.status()).toEqual([]);
});
