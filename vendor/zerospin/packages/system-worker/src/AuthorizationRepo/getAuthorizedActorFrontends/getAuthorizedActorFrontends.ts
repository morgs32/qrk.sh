/*
 * System-worker annotation:
 * Implements the AuthorizationRepo get Authorized Actor Frontends operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import type { IAuthorizedActorFrontend } from '../../types.js';
import { authorizationRepoDrizzleSchemas } from '../AuthorizationRepo.js';

export const getAuthorizedActorFrontends = Effect.fn(
  'AuthorizationRepo.getAuthorizedActorFrontends',
)(function* (props: { accountId: string; db: IDb }) {
  const { accountId, db } = props;
  yield* Effect.void;
  return db
    .select({
      actorId: authorizationRepoDrizzleSchemas.authorizations.actorId,
      actorName: authorizationRepoDrizzleSchemas.authorizations.actorName,
      frontendName: authorizationRepoDrizzleSchemas.authorizations.frontendName,
    })
    .from(authorizationRepoDrizzleSchemas.authorizations)
    .where(
      eq(authorizationRepoDrizzleSchemas.authorizations.status, 'succeeded'),
    )
    .all()
    .map(
      row =>
        ({
          accountId,
          actorId: row.actorId,
          actorName: row.actorName,
          frontendName: row.frontendName,
        }) as IAuthorizedActorFrontend,
    );
});
