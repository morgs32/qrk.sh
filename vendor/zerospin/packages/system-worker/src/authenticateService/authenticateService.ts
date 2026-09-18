import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import config from 'config';
import { Cause, Effect, Exit, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { SystemLogRepo } from '../SystemLogRepo/SystemLogRepo.js';

const { system } = config;

/** Authenticate one service version, retaining an independent durable audit attempt. */
export const authenticateService = Effect.fn(
  'SystemWorker.authenticateService',
  {
    root: true,
  },
)(function* (props: {
  serviceName: string;
  serviceVersion: string;
  signature: unknown;
}) {
  const service = system.services[props.serviceName]?.[props.serviceVersion];
  if (service === undefined) {
    return yield* new ZerospinError({
      code: 'authentication-service-unavailable',
      message: 'The requested service version is unavailable',
    });
  }
  const definition = service.authentication;
  const log = yield* SystemLogRepo.getRepo({
    key: { systemId: env.ZEROSPIN_SYSTEM_ID },
  });

  return yield* Effect.uninterruptibleMask(restore =>
    Effect.gen(function* () {
      const { attemptId } = yield* makeAsync(() =>
        log.beginServiceAuthenticationAttempt({
          serviceName: props.serviceName,
          serviceVersion: props.serviceVersion,
        }),
      ).pipe(Effect.flatMap(decodeRpc));

      const settled = yield* restore(
        Effect.gen(function* () {
          const signature = yield* Schema.decodeUnknownEffect(
            Schema.toType(definition.signatureSchema),
          )(props.signature, { onExcessProperty: 'error' }).pipe(
            mapParseError({
              code: 'authentication-signature-invalid',
              prefix: 'Invalid authentication signature',
            }),
          );
          const returned = yield* definition
            .authenticate({
              signature,
            })
            .pipe(Effect.provide(NanoIdFactory));
          const authentication = yield* Schema.decodeUnknownEffect(
            Schema.toType(definition.authenticationSchema),
          )(returned, { onExcessProperty: 'error' }).pipe(
            mapParseError({
              code: 'authentication-result-invalid',
              prefix: 'Invalid authentication result',
            }),
          );
          const encoded = yield* Schema.encodeEffect(
            definition.authenticationSchema,
          )(authentication).pipe(
            mapParseError({
              code: 'authentication-result-invalid',
              prefix: 'Authentication could not be encoded',
            }),
          );
          // Only explicitly declared selection claims cross into selection callbacks or replica names.
          const selected = Object.fromEntries(
            Object.keys(definition.selectionSchema.fields).map(field => [
              field,
              authentication[field],
            ]),
          );
          const selection = yield* Schema.decodeUnknownEffect(
            Schema.toType(definition.selectionSchema),
          )(selected, { onExcessProperty: 'error' }).pipe(
            mapParseError({
              code: 'authentication-selection-invalid',
              prefix: 'Invalid selection claims',
            }),
          );
          const encodedSelection = yield* Schema.encodeEffect(
            definition.selectionSchema,
          )(selection).pipe(
            mapParseError({
              code: 'authentication-selection-invalid',
              prefix: 'Selection could not be encoded',
            }),
          );
          const selectionStrings = yield* Schema.decodeUnknownEffect(
            Schema.Record(Schema.String, Schema.String),
          )(encodedSelection).pipe(
            mapParseError({
              code: 'authentication-selection-invalid',
              prefix: 'Selection claims must encode as strings',
            }),
          );
          const selectionPath = yield* Effect.try({
            try: () => createHref(definition.pattern, selectionStrings),
            catch: () =>
              new ZerospinError({
                code: 'authentication-selection-invalid',
                message: 'Selection could not be formatted',
              }),
          });
          const matched = yield* Effect.try({
            try: () =>
              createMatcher(definition.pattern).match(
                new URL(selectionPath, 'https://selection.invalid'),
              ),
            catch: () =>
              new ZerospinError({
                code: 'authentication-selection-invalid',
                message: 'Selection path could not be matched',
              }),
          });
          const recovered = yield* Schema.decodeUnknownEffect(
            definition.selectionSchema,
          )(matched?.params, { onExcessProperty: 'error' }).pipe(
            mapParseError({
              code: 'authentication-selection-invalid',
              prefix: 'Selection path is not reversible',
            }),
          );
          if (
            !isEqual(recovered, selection) ||
            createHref(definition.pattern, matched?.params) !== selectionPath
          ) {
            return yield* new ZerospinError({
              code: 'authentication-selection-invalid',
              message: 'Selection must have a lossless canonical round trip',
            });
          }
          const keys = new Set<string>();
          const pending: unknown[] = [encoded];
          while (pending.length > 0) {
            const value = pending.pop();
            if (Array.isArray(value)) {
              pending.push(...value);
            } else if (value !== null && typeof value === 'object') {
              for (const [key, child] of Object.entries(value)) {
                keys.add(key);
                pending.push(child);
              }
            }
          }
          const digest = yield* makeAsync(() =>
            crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(
                JSON.stringify(encoded, [...keys].sort()),
              ),
            ),
          );
          const authenticationHash = [...new Uint8Array(digest)]
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
          return {
            authentication: encoded,
            authenticationHash,
            selection: selectionStrings,
            selectionPath,
            systemName: system.name,
          };
        }),
      ).pipe(Effect.exit);

      // Interrupted authentication leaves its already-persisted attempt unfinished.
      if (Exit.isFailure(settled)) {
        if (Cause.hasInterrupts(settled.cause)) {
          return yield* Effect.failCause(settled.cause);
        }
        yield* makeAsync(() =>
          log.completeAuthenticationAttempt({
            attemptId,
            result: {
              status: 'failed',
              failure: {
                code: 'authentication-failed',
                message: 'Authentication did not succeed',
              },
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        return yield* Effect.failCause(settled.cause);
      }
      yield* makeAsync(() =>
        log.completeAuthenticationAttempt({
          attemptId,
          result: { status: 'succeeded', ...settled.value },
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      return settled.value;
    }),
  );
});
