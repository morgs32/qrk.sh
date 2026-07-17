/*
 * System-worker annotation:
 * Implements the AuthorizationRepo authorize operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import { type IActor } from '@zerospin/core/actorController/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { dutils } from '@zerospin/core/utils/dutils';
import { makeCursor } from '@zerospin/core/utils/makeCursor';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { authorizationRepoDrizzleSchemas } from '../AuthorizationRepo.js';

export const authorize = Effect.fn('AuthorizationRepo.authorize')(
  function* (props: {
    db: IDb;
    accountName: string;
    actor: IActor;
    actorName: string;
    frontendName: string;
  }) {
    const { actor, actorName, frontendName, db } = props;
    const { actorId } = actor;
    const now = yield* dutils.date();
    const status = 'succeeded';
    const failure = null;

    const authorizationAttemptCursor = yield* makeCursor({
      abbreviation: coreAbbreviations.authorizationAttemptCursor,
    });

    yield* makeTx({
      db,
      program: Effect.fn('AuthorizationRepo.authorize.transaction')(function* ({
        tx,
      }) {
        yield* Effect.void;
        tx.insert(authorizationRepoDrizzleSchemas.authorizationAttempts)
          .values({
            authorizationAttemptCursor,
            actorId,
            actorName,
            frontendName,
            attemptedAt: now,
            status,
            failure,
          })
          .run();

        const existingAuthorization = tx
          .select()
          .from(authorizationRepoDrizzleSchemas.authorizations)
          .where(
            and(
              eq(
                authorizationRepoDrizzleSchemas.authorizations.actorId,
                actorId,
              ),
              eq(
                authorizationRepoDrizzleSchemas.authorizations.actorName,
                actorName,
              ),
              eq(
                authorizationRepoDrizzleSchemas.authorizations.frontendName,
                frontendName,
              ),
            ),
          )
          .get();

        if (existingAuthorization) {
          tx.update(authorizationRepoDrizzleSchemas.authorizations)
            .set({ status, failure })
            .where(
              and(
                eq(
                  authorizationRepoDrizzleSchemas.authorizations.actorId,
                  actorId,
                ),
                eq(
                  authorizationRepoDrizzleSchemas.authorizations.actorName,
                  actorName,
                ),
                eq(
                  authorizationRepoDrizzleSchemas.authorizations.frontendName,
                  frontendName,
                ),
              ),
            )
            .run();
        } else {
          tx.insert(authorizationRepoDrizzleSchemas.authorizations)
            .values({
              actorId,
              actorName,
              frontendName,
              status,
              failure,
            })
            .run();
        }
      }),
    });

    return undefined as void;
  },
);
