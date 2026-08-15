import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

export const authorizeAggregateFrontend = Effect.fn(
  'AggregateRepo.authorizeAggregateFrontend',
)(function* (props: {
  aggregateId: string;
  aggregateName: string;
  frontendName: string;
  userId: string;
  db: IDb;
}): Effect.fn.Return<void, IAnyError> {
  const aggregateId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.aggregate),
  )(props.aggregateId).pipe(
    mapParseError({
      code: 'system-runtime-authorization-aggregate-id-invalid',
      prefix: 'Failed to decode frontend authorization aggregateId',
    }),
  );
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    props.userId,
  ).pipe(
    mapParseError({
      code: 'aggregate-authorization-user-id-invalid',
      prefix: 'Failed to decode aggregate authorization userId',
    }),
  );
  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: props.aggregateName,
    recordKind: 'aggregates',
  });
  yield* getByKeyOrThrow({
    record: aggregate.frontends,
    key: props.frontendName,
    recordKind: `frontends owned by aggregate ${props.aggregateName}`,
  });
  if (typeof aggregate.authorize !== 'function') {
    return yield* new ZerospinError({
      code: 'aggregate-authorization-required',
      message: `Aggregate ${props.aggregateName} has a frontend but no authorizer`,
    });
  }

  const query = Object.create(null);
  for (const modelName of Object.keys(aggregate.models)) {
    const modelQuery = Reflect.get(props.db.query, modelName);
    if (modelQuery === undefined) {
      return yield* new ZerospinError({
        code: 'aggregate-authorization-readable-query-required',
        message: `Aggregate authorization cannot resolve model query "${modelName}"`,
        extra: {
          aggregateName: props.aggregateName,
          frontendName: props.frontendName,
          modelName,
        },
      });
    }
    Reflect.set(query, modelName, modelQuery);
  }

  yield* aggregate.authorize({
    frontendName: props.frontendName,
    aggregateId,
    userId,
    db: { query },
  });
});
