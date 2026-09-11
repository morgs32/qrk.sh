import type { IDb } from '@zerospin/core/drizzle/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError } from '@zerospin/error';
import config from 'config';
import { Effect, Schema } from 'effect';

const { system } = config;

/*
 * Service frontend admission runs the authored authorizer against owner-local
 * queries. The request supplies the frontendName and authenticated authentication; this
 * operation exposes only queries for service-owned models.
 *
 * 1. Resolve the service definition.
 * 2. Check the requested frontend binding.
 * 3. Require an authored service authorizer.
 * 4. Construct the service-local query surface.
 * 5. Run the admission policy.
 */
export const authorizeServiceFrontend = Effect.fn(
  'VersionedServiceRepo.authorizeServiceFrontend',
)(function* (props: {
  serviceName: string;
  serviceVersion: string;
  frontendName: string;
  authentication: Readonly<Record<string, unknown>>;
  db: IDb;
}) {
  const { db, frontendName, serviceName, authentication } = props;

  // 1 — read the authored service by serviceName
  const latestService = yield* getByKeyOrThrow({
    record: system.services,
    key: serviceName,
    recordKind: 'services',
  });
  const service = yield* getByKeyOrThrow({
    record: latestService,
    key: props.serviceVersion,
    recordKind: 'listed versions',
  });

  // 2 — require frontendName in service.frontends
  yield* getByKeyOrThrow({
    record: service.frontends,
    key: frontendName,
    recordKind: `frontends owned by service ${serviceName}`,
  });

  // 3 — return service-authorization-required when missing
  if (typeof service.authorize !== 'function') {
    return yield* new ZerospinError({
      code: 'service-authorization-required',
      message: `Service ${serviceName} has a frontend but no authorizer`,
    });
  }

  // 4 — reject missing model queries and copy only service.models entries
  const query = Object.create(null);
  for (const modelName of Object.keys(service.models)) {
    const modelQuery = Reflect.get(db.query, modelName);
    if (modelQuery === undefined) {
      return yield* new ZerospinError({
        code: 'service-authorization-readable-query-required',
        message: `Service authorization cannot resolve model query "${modelName}"`,
      });
    }
    Reflect.set(query, modelName, modelQuery);
  }

  // 5 — supply frontendName, authentication, and the restricted db.query surface
  yield* service.authorize({
    frontendName,
    authentication: yield* Schema.decodeUnknownEffect(
      service.authentication.authenticationSchema,
    )(authentication, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'authorization-authentication-invalid',
        prefix: 'Invalid saved authentication for authorization',
      }),
    ),
    db: { query },
  });
});
