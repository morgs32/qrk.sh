import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { AdmissionRequestSchema } from '@zerospin/core/identity/AdmissionRequestSchema';
import { AuthenticationPolicySchema } from '@zerospin/core/identity/AuthenticationPolicySchema';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { resolveServiceActorVersion } from '@zerospin/core/serviceActor/getServiceActorVersion';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import config from 'config';
import { Cause, Effect, Exit, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { SystemLogRepo } from '../../../SystemLogRepo/SystemLogRepo.js';

const { system } = config;

/** Authenticate one service version, retaining an independent durable audit attempt. */
export const admitService = Effect.fn('ServiceApi.admitService', {
  root: true,
})(function* (props: {
  serviceName: string;
  serviceVersion: string;
  actorName: string;
  actorVersion: string;
  request: IAdmissionRequest;
}) {
  const service = system.services[props.serviceName]?.[props.serviceVersion];
  if (service === undefined) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'identity-service-unavailable',
        message: 'The requested service version is unavailable',
      }),
    );
  }
  const actor = yield* resolveServiceActorVersion(
    { [service.version]: service },
    props,
  );
  const definition = actor.identity;
  const policy = actor.authentication;
  const log = yield* SystemLogRepo.getRepo({
    key: { systemId: env.ZEROSPIN_SYSTEM_ID },
  });

  return yield* Effect.uninterruptibleMask(restore =>
    Effect.gen(function* () {
      const { attemptId } = yield* makeAsync(() =>
        log.beginServiceAdmissionAttempt({
          serviceName: props.serviceName,
          serviceVersion: props.serviceVersion,
        }),
      ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));

      const settled = yield* restore(
        Effect.gen(function* () {
          const request = yield* Schema.decodeUnknownEffect(
            AdmissionRequestSchema,
          )(props.request, { onExcessProperty: 'error' }).pipe(
            mapParseError({
              code: 'admission-arguments-invalid',
              prefix: 'Invalid admission request',
            }),
          );
          yield* Schema.decodeUnknownEffect(AuthenticationPolicySchema)(
            policy,
            { onExcessProperty: 'error' },
          ).pipe(
            mapParseError({
              code: 'admission-policy-invalid',
              prefix: 'Invalid actor authentication policy',
            }),
          );
          const returned = yield* Effect.gen(function* () {
            if (policy === 'none') {
              if (!('claims' in request)) {
                return yield* Effect.fail(
                  makeZerospinError('admission-claims-required'),
                );
              }
              return request.claims;
            }
            if (!('credentials' in request)) {
              return yield* Effect.fail(
                makeZerospinError('admission-credentials-required'),
              );
            }
            const credentials = yield* Schema.decodeUnknownEffect(
              Schema.toType(policy.credentialsSchema),
            )(request.credentials, { onExcessProperty: 'error' }).pipe(
              mapParseError({
                code: 'authentication-credentials-invalid',
                prefix: 'Invalid authentication credentials',
              }),
            );
            return yield* policy
              .authenticate({
                credentials,
              })
              .pipe(Effect.provide(NanoIdFactory));
          });
          const claims = yield* Schema.decodeUnknownEffect(
            Schema.toType(definition.claimsSchema),
          )(returned, { onExcessProperty: 'error' }).pipe(
            mapParseError({
              code: 'identity-result-invalid',
              prefix: 'Invalid identity result',
            }),
          );
          const encoded = yield* Schema.encodeEffect(definition.claimsSchema)(
            claims,
          ).pipe(
            mapParseError({
              code: 'identity-result-invalid',
              prefix: 'Claims could not be encoded',
            }),
          );
          // Only explicitly declared selection claims cross into selection callbacks or replica names.
          const selected = Object.fromEntries(
            Object.keys(definition.identitySchema.fields).map(field => [
              field,
              claims[field],
            ]),
          );
          const selection = yield* Schema.decodeUnknownEffect(
            Schema.toType(definition.identitySchema),
          )(selected, { onExcessProperty: 'error' }).pipe(
            mapParseError({
              code: 'identity-selection-invalid',
              prefix: 'Invalid selection claims',
            }),
          );
          const encodedSelection = yield* Schema.encodeEffect(
            definition.identitySchema,
          )(selection).pipe(
            mapParseError({
              code: 'identity-selection-invalid',
              prefix: 'Selection could not be encoded',
            }),
          );
          const selectionStrings = yield* Schema.decodeUnknownEffect(
            Schema.Record(Schema.String, Schema.String),
          )(encodedSelection).pipe(
            mapParseError({
              code: 'identity-selection-invalid',
              prefix: 'Selection claims must encode as strings',
            }),
          );
          const actorPath = yield* Effect.try({
            try: () => createHref(definition.pattern, selectionStrings),
            catch: () =>
              makeZerospinError({
                code: 'identity-selection-invalid',
                message: 'Selection could not be formatted',
              }),
          });
          const matched = yield* Effect.try({
            try: () =>
              createMatcher(definition.pattern).match(
                new URL(actorPath, 'https://selection.invalid'),
              ),
            catch: () =>
              makeZerospinError({
                code: 'identity-selection-invalid',
                message: 'Selection path could not be matched',
              }),
          });
          const recovered = yield* Schema.decodeUnknownEffect(
            definition.identitySchema,
          )(matched?.params, { onExcessProperty: 'error' }).pipe(
            mapParseError({
              code: 'identity-selection-invalid',
              prefix: 'Selection path is not reversible',
            }),
          );
          if (
            !isEqual(recovered, selection) ||
            createHref(definition.pattern, matched?.params) !== actorPath
          ) {
            return yield* Effect.fail(
              makeZerospinError({
                code: 'identity-selection-invalid',
                message: 'Selection must have a lossless canonical round trip',
              }),
            );
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
          const claimsHash = [...new Uint8Array(digest)]
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
          return {
            claims: encoded,
            claimsHash,
            selection: selectionStrings,
            actorPath,
            systemName: system.name,
          };
        }),
      ).pipe(Effect.exit);

      // Interrupted admission leaves its already-persisted attempt unfinished.
      if (Exit.isFailure(settled)) {
        if (Cause.hasInterrupts(settled.cause)) {
          return yield* Effect.failCause(settled.cause);
        }
        yield* makeAsync(() =>
          log.completeAdmissionAttempt({
            attemptId,
            result: {
              status: 'failed',
              failure: {
                code: 'admission-failed',
                message: 'Admission did not succeed',
              },
            },
          }),
        ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
        return yield* Effect.failCause(settled.cause);
      }
      yield* makeAsync(() =>
        log.completeAdmissionAttempt({
          attemptId,
          result: { status: 'succeeded', ...settled.value },
        }),
      ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
      return settled.value;
    }),
  );
});
