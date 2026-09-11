import { ZerospinError } from '@zerospin/error';
import { CuidFactory } from '@zerospin/schema';
import { Effect, Layer, Result } from 'effect';
import { expect, it } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemorySqljsDb } from '../drizzle/makeProvisionedInMemorySqljsDb.ts';
import { User } from '../fixtures/system.ts';

import { initializeGuards } from './initializeGuards.ts';

it('builds command services lazily with the current transaction and full claims, retaining static services', async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const observed: unknown[] = [];
        const guardValues: string[] = [];
        const db = yield* makeProvisionedInMemorySqljsDb({
          dbConfig: makeResourceDbConfig({
            models: { user: User },
            otherTables: {},
          }),
        });
        const guards = yield* initializeGuards({
          layer: Layer.succeed(CuidFactory, () => Effect.succeed('static')),
          guardLayer: ({ db: transaction, authentication }) =>
            authentication?.role === 'static'
              ? Layer.empty
              : authentication === null
                ? Layer.effect(
                    CuidFactory,
                    Effect.fail(
                      new ZerospinError({ code: 'authentication-required' }),
                    ),
                  )
                : Layer.succeed(CuidFactory, () =>
                    Effect.sync(() => {
                      observed.push({ transaction, authentication });
                      return String(authentication.role);
                    }),
                  ),
          guards: {
            read: [
              () =>
                Effect.gen(function* () {
                  const makeId = yield* CuidFactory;
                  guardValues.push(yield* makeId());
                }),
            ],
          },
        });
        expect(observed).toEqual([]);
        for (const role of ['reader', 'writer', 'static']) {
          const authentication = {
            aggregateId: 'acct_guard',
            subject: 'same',
            role,
          };
          db.transaction(transaction => {
            Effect.runSync(
              guards.run('read', {
                db: transaction,
                authentication,
                payload: {},
              }),
            );
            if (role !== 'static') {
              expect(observed.at(-1)).toEqual({ transaction, authentication });
            }
          });
        }
        expect(guardValues).toEqual(['reader', 'writer', 'static']);
        const denied = yield* guards
          .run('read', { db, authentication: null, payload: {} })
          .pipe(Effect.result);
        expect(Result.isFailure(denied)).toBe(true);
        if (Result.isFailure(denied)) {
          expect(denied.failure.code).toBe('authentication-required');
        }
      }),
    ).pipe(Effect.provide(AsyncLive)),
  );
});
