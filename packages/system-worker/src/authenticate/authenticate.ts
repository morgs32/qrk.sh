import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { IAuthentication } from '@zerospin/core/authentication/types';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';
import { system } from 'system';

import { AggregateChain } from '../AggregateChain/AggregateChain.js';

/*
 * Frontend capability admission invokes the authored authentication program.
 * This boundary validates the requested authentication definition and returns the
 * authenticated userId with the matching lock and authored system identity.
 *
 * 1. Read the submitted signature context.
 * 2. Find the requested authentication definition.
 * 3. Reject unavailable or changed definitions.
 * 4. Decode and authenticate the signature.
 * 5. Validate the authenticated identity.
 * 6. Await application provisioning before returning that identity.
 */
export const authenticate = Effect.fn('SystemWorker.authenticate', {
  root: true,
})(function* (props: {
  authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
  signature: unknown;
}): Effect.fn.Return<
  Readonly<{
    userId: string;
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    systemName: string;
  }>,
  IAnyError,
  Async
> {
  // 1 — separate the lock from the untrusted signature value
  const { authenticationLock, signature: requestedSignature } = props;

  // 2 — select exactly the requested independent authentication version
  const definition: IAuthentication | undefined = system.authentication.find(
    definition => definition.version === authenticationLock.version,
  );

  // 3 — compare the entire authored definition with the frontend lock
  if (
    definition === undefined ||
    !isEqual(definition.spec, authenticationLock)
  ) {
    return yield* new ZerospinError({
      code: 'authentication-lock-unsupported',
      message: `Authentication version ${authenticationLock.version} is unavailable or changed`,
    });
  }

  // 4 — decode and run this version's authored authentication program
  const signature = yield* Schema.decodeUnknownEffect(definition.signature)(
    requestedSignature,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'authentication-signature-invalid',
      prefix: `Failed to decode authentication signature version "${definition.version}"`,
    }),
  );
  const returnedUserId = yield* definition.authenticate({ signature });

  // 5 — require a nonempty userId before returning the lock and system metadata
  const userId = yield* Schema.decodeUnknownEffect(Schema.NonEmptyString)(
    returnedUserId,
  ).pipe(
    mapParseError({
      code: 'system-runtime-authentication-user-invalid',
      prefix: 'The static System returned an invalid authenticated userId',
    }),
  );

  // 6 — run on every authentication; the authored hook owns repeat-safe provisioning
  if (definition.onAuthentication !== undefined) {
    yield* definition
      .onAuthentication({
        userId,
        executeAggregateCommand: Effect.fn(
          'authentication.executeAggregateCommand',
        )(function* (requestedCommand) {
          // A hook cannot supply a different identity or impersonate a frontend session.
          const command = yield* Schema.decodeUnknownEffect(
            EncodedAggregateCommandSchema,
          )({
            ...requestedCommand,
            userId,
            sessionId: null,
            frontendName: null,
            pushIndex: null,
          }).pipe(
            mapParseError({
              code: 'authentication-command-invalid',
              prefix: 'Invalid authentication command',
            }),
          );
          if (
            command.systemName !== system.name ||
            command.sessionId !== null
          ) {
            return yield* new ZerospinError({
              code: 'authentication-command-invalid',
              message:
                'Authentication commands must target this system without a frontend session',
            });
          }
          yield* getByKeyOrThrow({
            record: system.aggregates[command.aggregateName] ?? {},
            key: command.aggregateVersion,
            recordKind: 'aggregate versions',
          });
          const chain = yield* AggregateChain.getRepo({
            key: {
              systemId: env.ZEROSPIN_SYSTEM_ID,
              aggregateId: command.aggregateId,
              aggregateName: command.aggregateName,
            },
          });
          return yield* makeAsync<
            Awaited<ReturnType<AggregateChain['executeAggregateCommand']>>
          >(() =>
            chain.executeAggregateCommand({
              aggregateVersion: command.aggregateVersion,
              command,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
        }),
      })
      .pipe(Effect.provide(NanoIdFactory));
  }
  return {
    userId,
    authenticationLock,
    systemName: system.name,
  };
});
