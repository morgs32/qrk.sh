import type { IDb } from '@zerospin/core/drizzle/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

export const executeServiceQuery = Effect.fn(
  'MaterializedServiceRepo.executeServiceQuery',
)(function* (props: {
  serviceName: string;
  queryName: string;
  params: unknown;
  db: IDb;
}) {
  const service = yield* getByKeyOrThrow({
    record: system.services,
    key: props.serviceName,
    recordKind: 'services',
  });
  const queryDefinition = service.queries[props.queryName];
  if (queryDefinition === undefined) {
    return yield* new ZerospinError({
      code: 'service-query-not-found',
      message: `Service query ${props.serviceName}.${props.queryName} was not found`,
    });
  }
  const params = yield* Schema.decodeEffect(
    Schema.toType(queryDefinition.paramsSchema),
  )(props.params, { onExcessProperty: 'ignore' }).pipe(
    mapParseError({
      code: 'failed-to-decode-service-query-params',
      prefix: `Failed to decode params for ${props.serviceName}.${props.queryName}`,
    }),
  );
  const query = Object.create(null);
  for (const modelName of Object.keys(service.models)) {
    const modelQuery = Reflect.get(props.db.query, modelName);
    if (modelQuery === undefined) {
      return yield* new ZerospinError({
        code: 'service-query-readable-query-required',
        message: `Service query cannot resolve model query "${modelName}"`,
      });
    }
    Reflect.set(query, modelName, modelQuery);
  }
  return yield* queryDefinition.query({ db: { query }, params });
});
