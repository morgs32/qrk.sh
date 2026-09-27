import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import config from 'config';
import { Effect, Schema, type Context } from 'effect';

const { system } = config;

/*
 * Session admission runs aggregate authorization against the selected
 * version-owned materializer. The authorizer receives only queries for models
 * owned by that aggregate, plus the requested definition, aggregateId, and identity.
 *
 * 1. Resolve the requested aggregate version.
 * 2. Allow access when authorization is omitted.
 * 3. Build the owner-local query surface.
 * 4. Run the authored admission check.
 */
export const authorizeAggregateSession = Effect.fn(
  'AggregateVersionRepo.authorizeAggregateSession',
)(function* (props: {
  aggregateId: IAggregateId;
  aggregateName: string;
  aggregateVersion: string;
  actorName: string;
  actorVersion: string;
  sessionName: string;
  claims: Readonly<Record<string, unknown>>;
  db: IDb;
}) {
  const {
    aggregateId,
    aggregateName,
    aggregateVersion,
    db,
    sessionName,
    claims,
    actorName,
    actorVersion,
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
  const actor = yield* resolveAggregateActorVersion(
    { [aggregate.version]: aggregate },
    { actorName, actorVersion },
  );
  if (actor.authorize === undefined) return;

  // 3 — copy only aggregate model queries and reject missing query bindings
  const query = Object.create(null);
  for (const modelName of Object.keys(aggregate.models)) {
    const modelQuery = Reflect.get(db.query, modelName);
    if (modelQuery === undefined) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'aggregate-authorization-readable-query-required',
          message: `Aggregate authorization cannot resolve model query "${modelName}"`,
          extra: {
            aggregateName,
            sessionName,
            modelName,
          },
        }),
      );
    }
    Reflect.set(query, modelName, modelQuery);
  }

  // 4 — supply aggregateId, claims, and the restricted query object
  const context: Context.Context<unknown> = yield* system.runtime.contextEffect;

  const decodedClaims = yield* Schema.decodeUnknownEffect(
    actor.identity.claimsSchema,
  )(claims, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'authorization-claims-invalid',
      prefix: 'Invalid actor claims',
    }),
  );

  yield* actor
    .authorize({
      aggregateId,
      sessionName,
      claims: decodedClaims,
      db: { query },
    })
    .pipe(Effect.provideContext(context));
}, Effect.scoped);
