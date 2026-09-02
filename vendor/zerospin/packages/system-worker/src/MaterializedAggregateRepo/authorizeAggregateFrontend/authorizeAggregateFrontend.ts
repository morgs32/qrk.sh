import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

export const authorizeAggregateFrontend = Effect.fn(
  'MaterializedAggregateRepo.authorizeAggregateFrontend',
)(function* (props: {
  aggregateId: IAggregateId;
  aggregateName: string;
  frontendName: string;
  userId: string;
  db: IDb;
}): Effect.fn.Return<void, IAnyError> {
  const { aggregateId, aggregateName, db, frontendName, userId } = props;
  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: aggregateName,
    recordKind: 'aggregates',
  });
  yield* getByKeyOrThrow({
    record: aggregate.frontends,
    key: frontendName,
    recordKind: `frontends owned by aggregate ${aggregateName}`,
  });
  if (typeof aggregate.authorize !== 'function') {
    return yield* new ZerospinError({
      code: 'aggregate-authorization-required',
      message: `Aggregate ${aggregateName} has a frontend but no authorizer`,
    });
  }

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

  yield* aggregate.authorize({
    frontendName,
    aggregateId,
    userId,
    db: { query },
  });
});
