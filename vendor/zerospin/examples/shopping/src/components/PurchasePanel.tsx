import { useEffect, useState } from 'react';

import { makePurchaseQuote } from '@zerospin/purchase/browser';
import { stageCommand, useLiveQuery } from '@zerospin/react';
import { checkGuards } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { purchaseFrontend } from '../zerospin/aggregates/shopper/purchaseFrontend';

import { Button } from './ui/button';
import { useCheckoutCommands } from './useCheckoutCommands';

import { shopperSession } from '@/zerospin/shopperSession';
const {
  checkout: checkoutV1,
  purchase: purchaseV1,
  paymentIntent: paymentIntentV1,
  cartPromotion: cartPromotionV1,
} = purchaseFrontend.models;

const money = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    amount / 100,
  );
export function PurchasePanel() {
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const { data: cart } = useLiveQuery({
    session: shopperSession,
    query: db =>
      db.query.cart.findFirst({ with: { items: { with: { product: true } } } }),
  });
  const { data: checkouts } = useLiveQuery({
    session: shopperSession,
    query: db => db.query.checkout.findMany({ orderBy: { createdAt: 'desc' } }),
  });
  const { data: promotions } = useLiveQuery({
    session: shopperSession,
    query: db => db.query.cartPromotion.findMany(),
  });
  const { data: purchases } = useLiveQuery({
    session: shopperSession,
    query: db =>
      db.query.purchase.findMany({
        with: { items: true, paymentIntents: true },
        orderBy: { createdAt: 'desc' },
      }),
  });
  const { pending, latestFailure } = useCheckoutCommands(shopperSession);
  const active = checkouts?.find(
    row =>
      row.cartId === cart?.id &&
      [
        'promotion',
        'accepted',
        'paying',
        'declined',
        'removing',
        'failed',
      ].includes(row.status),
  );
  const promotion = promotions?.find(
    row => row.id === active?.promotionReservationId,
  );
  const frozen = checkouts?.some(
    row =>
      row.cartId === cart?.id &&
      ['accepted', 'paying', 'declined'].includes(row.status),
  );
  const reserved =
    active?.status === 'promotion' &&
    promotion?.status === 'reserved' &&
    (promotion.expiresAt ?? 0) > now;
  const quote = cart
    ? makePurchaseQuote(cart.items, reserved ? promotion.id : null)
    : null;
  const showResult = (result: {
    _tag: string;
    failure?: { message: string };
  }) => setError(result.failure?.message ?? null);
  return (
    <section aria-label="Purchases" className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Simulated checkout — no real payments. Payment processing takes five
        seconds.
      </p>
      {pending ? (
        <p role="status">Changes pending server confirmation…</p>
      ) : null}
      {error || latestFailure ? (
        <p role="alert">{error ?? latestFailure?.message}</p>
      ) : null}
      {active?.failure ? <p role="alert">{active.failure}</p> : null}
      {active?.status === 'accepted' ? (
        <p role="status">Preparing your accepted purchase…</p>
      ) : null}
      {frozen ? (
        <p>Your cart is frozen until this purchase is paid or canceled.</p>
      ) : null}
      {!frozen && cart && cart.items.length > 0 ? (
        <div className="space-y-2">
          {active ? (
            <>
              <p role="status">
                {active.status === 'removing'
                  ? 'Releasing promotion…'
                  : reserved
                    ? `50% off reserved · ${Math.max(0, Math.ceil(((promotion?.expiresAt ?? 0) - now) / 1000))} seconds remaining`
                    : promotion?.status === 'requested'
                      ? 'Reserving promotion…'
                      : promotion?.status === 'denied'
                        ? 'Promotion unavailable. Remove it to pay without a promotion or apply again.'
                        : 'Promotion expired or unavailable. Remove it to continue.'}
              </p>
              {active.status === 'promotion' || active.status === 'failed' ? (
                <Button
                  variant="outline"
                  disabled={
                    Effect.runSync(
                      checkGuards({
                        session: shopperSession,
                        contractName: 'removePromotion',
                        payload: { checkoutId: active.id },
                      }),
                    ) !== null
                  }
                  onClick={() =>
                    showResult(
                      stageCommand({
                        session: shopperSession,
                        contractName: 'removePromotion',
                        payload: { checkoutId: active.id },
                      }),
                    )
                  }
                >
                  Remove promotion · pay without discount
                </Button>
              ) : null}
            </>
          ) : (
            <Button
              variant="outline"
              disabled={
                Effect.runSync(
                  checkGuards({
                    session: shopperSession,
                    contractName: 'applyPromotion',
                    payload: {
                      id: 'prv_preview',
                      checkoutId: 'chk_preview',
                      cartId: cart.id,
                      userId: cart.userId!,
                    },
                  }),
                ) !== null
              }
              onClick={() =>
                showResult(
                  stageCommand({
                    session: shopperSession,
                    contractName: 'applyPromotion',
                    payload: {
                      id: shopperSession.makeId(cartPromotionV1),
                      checkoutId: shopperSession.makeId(checkoutV1),
                      cartId: cart.id,
                      userId: cart.userId!,
                    },
                  }),
                )
              }
            >
              Apply promotion · 50% off
            </Button>
          )}
          {quote ? (
            <>
              <p>
                Subtotal {money(quote.subtotalAmount)} · Discount −
                {money(quote.discountAmount)} · Total {money(quote.totalAmount)}
              </p>
              <Button
                disabled={
                  Effect.runSync(
                    checkGuards({
                      session: shopperSession,
                      contractName: 'confirmCheckout',
                      payload: {
                        id: active?.id ?? 'chk_preview',
                        purchaseId: 'pur_preview',
                        paymentIntentId: 'pmt_preview',
                        cartId: cart.id,
                        userId: cart.userId!,
                        quote,
                        expected: active ? 'promotion' : null,
                      },
                    }),
                  ) !== null
                }
                onClick={() =>
                  showResult(
                    stageCommand({
                      session: shopperSession,
                      contractName: 'confirmCheckout',
                      payload: {
                        id: active?.id ?? shopperSession.makeId(checkoutV1),
                        purchaseId: shopperSession.makeId(purchaseV1),
                        paymentIntentId: shopperSession.makeId(paymentIntentV1),
                        cartId: cart.id,
                        userId: cart.userId!,
                        quote,
                        expected: active ? 'promotion' : null,
                      },
                    }),
                  )
                }
              >
                Confirm purchase · {money(quote.totalAmount)}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {(purchases ?? []).map(purchase => {
        const checkout = checkouts?.find(row => row.purchaseId === purchase.id);
        const unresolved = purchase.paymentIntents.some(intent =>
          ['pending', 'executing', 'uncertain'].includes(intent.status),
        );
        const retry =
          checkout?.status === 'declined' &&
          purchase.status === 'unpaid' &&
          !unresolved;
        const promotion = promotions?.find(
          row => row.id === purchase.promotionReservationId,
        );
        return (
          <article
            key={purchase.id}
            className="space-y-2 rounded-md border p-3"
            data-testid={`purchase-${purchase.id}`}
          >
            <p className="font-medium">
              {money(purchase.totalAmount)} ·{' '}
              {purchase.status === 'paid'
                ? 'Paid (simulated)'
                : purchase.status === 'canceled'
                  ? 'Canceled'
                  : unresolved
                    ? purchase.paymentIntents.some(
                        intent => intent.status === 'uncertain',
                      )
                      ? 'Payment outcome unresolved'
                      : 'Processing payment'
                    : 'Payment declined'}
            </p>
            <ul>
              {purchase.items.map(item => (
                <li key={item.id}>
                  {item.name} × {item.quantity}
                </li>
              ))}
            </ul>
            {purchase.discountAmount > 0 ? (
              <p>50% promotion · Saved {money(purchase.discountAmount)}</p>
            ) : null}
            {purchase.status === 'paid' && promotion?.status === 'committed' ? (
              <p role="status">Payment complete. Finalizing promotion…</p>
            ) : null}
            {purchase.status === 'canceled' &&
            promotion?.status === 'committed' ? (
              <p role="status">Canceled. Releasing promotion…</p>
            ) : null}
            <ul className="text-xs text-muted-foreground">
              {purchase.paymentIntents.map(intent => (
                <li key={intent.id}>
                  {intent.id} · {intent.status}
                  {intent.failure ? ` · ${intent.failure}` : ''}
                </li>
              ))}
            </ul>
            {retry && checkout ? (
              <>
                <Button
                  disabled={
                    Effect.runSync(
                      checkGuards({
                        session: shopperSession,
                        contractName: 'initiatePayment',
                        payload: {
                          id: 'pmt_preview',
                          checkoutId: checkout.id,
                          purchaseId: purchase.id,
                          expectedExisting: false,
                        },
                      }),
                    ) !== null
                  }
                  onClick={() =>
                    showResult(
                      stageCommand({
                        session: shopperSession,
                        contractName: 'initiatePayment',
                        payload: {
                          id: shopperSession.makeId(paymentIntentV1),
                          checkoutId: checkout.id,
                          purchaseId: purchase.id,
                          expectedExisting: false,
                        },
                      }),
                    )
                  }
                >
                  Retry payment at original price
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    Effect.runSync(
                      checkGuards({
                        session: shopperSession,
                        contractName: 'cancelPurchase',
                        payload: {
                          checkoutId: checkout.id,
                          purchaseId: purchase.id,
                        },
                      }),
                    ) !== null
                  }
                  onClick={() =>
                    showResult(
                      stageCommand({
                        session: shopperSession,
                        contractName: 'cancelPurchase',
                        payload: {
                          checkoutId: checkout.id,
                          purchaseId: purchase.id,
                        },
                      }),
                    )
                  }
                >
                  Cancel purchase
                </Button>
              </>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
