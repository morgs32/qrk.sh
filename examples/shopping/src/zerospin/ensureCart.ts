import { stageServiceCommand } from '@zerospin/react';
import { makeId, NanoIdFactory } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { cartV1 } from './services/marketplace/models/cart/CartV1';
import { shopperSession } from './shopperSession';

let creating: { userId: string; promise: Promise<`crt_${string}`> } | undefined;

/** Serialize first-cart creation across cards and wait for the Node projection. */
export function ensureCart(userId: string): Promise<`crt_${string}`> {
  if (creating?.userId === userId) return creating.promise;
  const existing = shopperSession.store
    .getState()
    .db?.query.cart.findFirst({ where: { userId: { eq: userId } } })
    .sync();
  if (existing) return Promise.resolve(existing.id);
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
      const initial = shopperSession.store.getState();
      if (!initial.isInitialized) {
        reject(new Error('The shopper session was interrupted.'));
        return;
      }
      const { db } = initial;
      let settled = false;
      let unsubscribeSession: (() => void) | undefined;
      let unsubscribeDatabase: (() => void) | undefined;
      const finish = (failure?: unknown) => {
        if (settled) return;
        settled = true;
        unsubscribeSession?.();
        unsubscribeDatabase?.();
        if (failure !== undefined) reject(failure);
        else resolve();
      };
      const inspect = () => {
        if (settled) return;
        const state = shopperSession.store.getState();
        if (
          !state.isInitialized ||
          state.db !== db ||
          state.claims.clerkUserId !== userId ||
          state.sessionStatus === 'failed' ||
          state.sessionStatus === 'released'
        ) {
          finish(new Error('The shopper session was interrupted.'));
          return;
        }
        try {
          const command = db.query.commands
            .findMany({
              where: { id: { eq: staged.success.id } },
              orderBy: { sessionIndex: 'asc' },
            })
            .sync()
            .find(row => row.payload !== null);
          if (command?.admission?.status === 'failed') {
            finish(command.admission.failure);
            return;
          }
          if (command?.execution?.status === 'failed') {
            finish(command.execution.failure);
            return;
          }
          if (
            command !== undefined &&
            command.executedIndex !== null &&
            db.query.cart.findFirst({ where: { id: { eq: id } } }).sync()
          ) {
            finish();
          }
        } catch (failure) {
          finish(failure);
        }
      };
      unsubscribeSession = shopperSession.store.subscribe(inspect);
      unsubscribeDatabase = db.$client.subscribeToTableChanges(tableNames => {
        if (tableNames.has('commands') || tableNames.has('cart')) inspect();
      });
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
