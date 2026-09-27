import type { IDb } from '@zerospin/core/drizzle/types';
import { resolveServiceActorVersion } from '@zerospin/core/serviceActor/getServiceActorVersion';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import config from 'config';
import { Effect, Schema, type Context } from 'effect';

const { system } = config;

/*
 * Owner-local admission for one service definition. The repo calls this after
 * catch-up; the gateway has already checked the definition lock and returns
 * the definition spec. This method decides admission by running the authored
 * actor authorizer against queries for this service's models. An omitted
 * authorizer admits the caller.
 *
 * 1. Resolve the authored service.
 * 2. Skip when the actor has no authorizer.
 * 3. Copy this service's model queries.
 * 4. Reuse the system runtime capability context.
 * 5. Decode the actor identity.
 * 6. Run the authored authorizer.
 */
export const authorizeServiceSession = Effect.fn(
  'ServiceVersionRepo.authorizeServiceSession',
)(function* (props: {
  serviceName: string;
  serviceVersion: string;
  actorName: string;
  actorVersion: string;
  sessionName: string;
  identity: Readonly<Record<string, unknown>>;
  db: IDb;
}) {
  const {
    db,
    sessionName,
    serviceName,
    identity,
    serviceVersion,
    actorName,
    actorVersion,
  } = props;

  // 1 — read system.services by serviceName, then the listed serviceVersion
  const latestService = yield* getByKeyOrThrow({
    record: system.services,
    key: serviceName,
    recordKind: 'services',
  });
  const service = yield* getByKeyOrThrow({
    record: latestService,
    key: serviceVersion,
    recordKind: 'listed versions',
  });

  // 2 — resolve the actor version; omitted authorize admits without reading identity
  const actor = yield* resolveServiceActorVersion(
    { [service.version]: service },
    { actorName, actorVersion },
  );
  if (typeof actor.authorize !== 'function') {
    return;
  }

  // 3 — null-prototype query; a missing model query fails service-authorization-readable-query-required
  const query = Object.create(null);
  for (const modelName of Object.keys(service.models)) {
    const modelQuery = Reflect.get(db.query, modelName);
    if (modelQuery === undefined) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-authorization-readable-query-required',
          message: `Service authorization cannot resolve model query "${modelName}"`,
        }),
      );
    }
    Reflect.set(query, modelName, modelQuery);
  }

  // 4 — reuse the context acquired by the system runtime
  const context: Context.Context<unknown> = yield* system.runtime.contextEffect;

  // 5 — decode the request against actor.identity.IdentitySchema
  const decodedIdentity = yield* Schema.decodeUnknownEffect(
    actor.identity.identitySchema,
  )(identity, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'authorization-identity-invalid',
      prefix: 'Invalid actor identity',
    }),
  );

  // 6 — run the actor authorizer with the shared system capabilities

  yield* actor
    .authorize({
      sessionName,
      identity: decodedIdentity,
      db: { query },
    })
    .pipe(Effect.provideContext(context));
}, Effect.scoped);
