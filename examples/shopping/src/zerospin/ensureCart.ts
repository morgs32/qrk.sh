import { stageServiceCommand } from '@zerospin/react';
import { makeId, NanoIdFactory } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { cartV1 } from './services/marketplace/models/cart/CartV1';
import { shopperSession } from './shopperSession';

let creating: { userId: string; promise: Promise<`crt_${string}`> } | undefined;

/** Serialize first-cart creation across cards and wait for the Node projection. */
export function ensureCart(userId: string): Promise<`crt_${string}`> {
  const existing = shopperSession.store
    .getState()
    .db?.query.cart.findFirst({ where: { userId: { eq: userId } } })
    .sync();
  if (existing) return Promise.resolve(existing.id);
  if (creating?.userId === userId) return creating.promise;
  const promise = (async () => {
    const id = Effect.runSync(
      makeId(cartV1).pipe(Effect.provide(NanoIdFactory)),
    );
    const staged = await stageServiceCommand({
      session: shopperSession,
      contractName: 'createCart',
      payload: { id, userId },
    });
    if (staged._tag === 'Failure') throw staged.failure;
    await new Promise<void>((resolve, reject) => {
      const inspect = () => {
        const state = shopperSession.store.getState();
        if (
          !state.isInitialized ||
          state.claims.clerkUserId !== userId ||
          state.sessionStatus === 'failed' ||
          state.sessionStatus === 'released'
        ) {
          unsubscribe();
          reject(new Error('The shopper session was interrupted.'));
          return;
        }
        const failure = state.commandHistory?.find(
          command => command.id === staged.success.id,
        )?.failure;
        if (failure) {
          unsubscribe();
          reject(failure);
          return;
        }
        if (
          state.db.query.cart.findFirst({ where: { id: { eq: id } } }).sync()
        ) {
          unsubscribe();
          resolve();
        }
      };
      const unsubscribe = shopperSession.store.subscribe(inspect);
      inspect();
    });
    return id;
  })();
  creating = { userId, promise };
  void promise
    .finally(() => {
      if (creating?.promise === promise) creating = undefined;
    })
    .catch(() => {});
  return promise;
}
