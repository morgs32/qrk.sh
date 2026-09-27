import { verifyToken } from '@clerk/backend';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { ClerkUserIdSchema } from './aggregates/shopper/models/user/UserV1';
import { type clerkCredentialsSchema } from './identities';

/** Verify the session before deriving claims or issuing a provisioning command. */
export const verifyClerkIdentity = Effect.fn('verifyClerkIdentity')(function* (
  credentials: typeof clerkCredentialsSchema.Type,
) {
  const { env } = yield* Effect.promise(() => import('cloudflare:workers'));
  const authorizedParties = env.CLERK_AUTHORIZED_PARTIES?.split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (!env.CLERK_JWT_KEY || !authorizedParties?.length) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'clerk-verification-not-configured',
        message:
          'Set CLERK_JWT_KEY and CLERK_AUTHORIZED_PARTIES on the Shopping worker.',
      }),
    );
  }
  const claims = yield* Effect.tryPromise({
    try: () =>
      verifyToken(credentials.token, {
        jwtKey: env.CLERK_JWT_KEY,
        authorizedParties,
      }),
    catch: () =>
      makeZerospinError({
        code: 'clerk-session-invalid',
        message: 'The Clerk session could not be verified.',
      }),
  });
  return yield* Schema.decodeUnknownEffect(ClerkUserIdSchema)(claims.sub).pipe(
    mapParseError({
      code: 'clerk-session-subject-invalid',
      prefix: 'Invalid verified Clerk subject',
    }),
  );
});
