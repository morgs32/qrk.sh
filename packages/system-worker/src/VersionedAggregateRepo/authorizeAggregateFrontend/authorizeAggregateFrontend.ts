import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import config from 'config';
import { Effect, Schema } from 'effect';

const { system } = config;

/*
 * Frontend admission runs aggregate authorization against the selected
 * version-owned materializer. The authorizer receives only queries for models
 * owned by that aggregate, plus the requested frontend, aggregateId, and authentication.
 *
 * 1. Resolve the requested aggregate version.
 * 2. Allow access when authorization is omitted.
 * 3. Build the owner-local query surface.
 * 4. Run the authored admission check.
 */
export const authorizeAggregateFrontend = Effect.fn(
  'VersionedAggregateRepo.authorizeAggregateFrontend',
)(function* (props: {
  aggregateId: IAggregateId;
  aggregateName: string;
  aggregateVersion: string;
  frontendName: string;
  authentication: Readonly<Record<string, unknown>>;
  db: IDb;
}): Effect.fn.Return<void, IAnyError> {
  const {
    aggregateId,
    aggregateName,
    aggregateVersion,
    db,
    frontendName,
    authentication,
  } = props;

  // 1 — select aggregateVersion from the authored aggregate definition
  const latestAggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: aggregateName,
    recordKind: 'aggregates',
  });
  const aggregate = yield* getByKeyOrThrow({
    record: latestAggregate,
    key: aggregateVersion,
    recordKind: 'listed versions',
  });

  // 2 — omitted authorization allows access
  if (aggregate.authorize === undefined) return;

  // 3 — copy only aggregate model queries and reject missing query bindings
  const query = Object.create(null);
  for (const modelName of Object.keys(aggregate.models)) {
    const modelQuery = Reflect.get(db.query, modelName);
    if (modelQuery === undefined) {
      return yield* new ZerospinError({
        code: 'aggregate-authorization-readable-query-required',
        message: `Aggregate authorization cannot resolve model query "${modelName}"`,
        extra: {
          aggregateName,
          frontendName,
          modelName,
        },
      });
    }
    Reflect.set(query, modelName, modelQuery);
  }

  // 4 — supply aggregateId, authentication, and the restricted query object
  yield* aggregate.authorize({
    aggregateId,
    authentication: yield* Schema.decodeUnknownEffect(
      aggregate.authentication.authenticationSchema,
    )(authentication, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'authorization-authentication-invalid',
        prefix: 'Invalid saved authentication for authorization',
      }),
    ),
    db: { query },
  });
});
