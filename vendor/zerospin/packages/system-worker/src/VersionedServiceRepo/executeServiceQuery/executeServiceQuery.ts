import type { IDb } from '@zerospin/core/drizzle/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

/*
 * The service owner executes a named authored query against only its local
 * model queries. This boundary decodes query-specific parameters and preserves
 * the authored query Effect outcome.
 *
 * 1. Resolve the service definition.
 * 2. Require the named service query.
 * 3. Decode the authored query parameters.
 * 4. Build the owner-local query surface.
 * 5. Execute the authored query.
 */
export const executeServiceQuery = Effect.fn(
  'VersionedServiceRepo.executeServiceQuery',
)(function* (props: {
  serviceName: string;
  serviceVersion: string;
  queryName: string;
  params: unknown;
  db: IDb;
}) {
  const { db, params: rawParams, queryName, serviceName } = props;

  // 1 — select system.services by serviceName
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

  // 2 — return service-query-not-found when absent
  const queryDefinition = service.queries[queryName];
  if (queryDefinition === undefined) {
    return yield* new ZerospinError({
      code: 'service-query-not-found',
      message: `Service query ${serviceName}.${queryName} was not found`,
    });
  }

  // 3 — use paramsSchema and ignore excess parameter properties
  const params = yield* Schema.decodeEffect(
    Schema.toType(queryDefinition.paramsSchema),
  )(rawParams, { onExcessProperty: 'ignore' }).pipe(
    mapParseError({
      code: 'failed-to-decode-service-query-params',
      prefix: `Failed to decode params for ${serviceName}.${queryName}`,
    }),
  );

  // 4 — require query bindings for every service model
  const query = Object.create(null);
  for (const modelName of Object.keys(service.models)) {
    const modelQuery = Reflect.get(db.query, modelName);
    if (modelQuery === undefined) {
      return yield* new ZerospinError({
        code: 'service-query-readable-query-required',
        message: `Service query cannot resolve model query "${modelName}"`,
      });
    }
    Reflect.set(query, modelName, modelQuery);
  }

  // 5 — supply decoded params and restricted db.query
  return yield* queryDefinition.query({ db: { query }, params });
});
