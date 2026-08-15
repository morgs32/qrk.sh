import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

export const makeSelectionWhere = Effect.fn(
  'AggregateFrontendRepo.makeSelectionWhere',
)(function* (props: {
  aggregateName: string;
  userId: string;
  modelName: string;
}): Effect.fn.Return<Record<string, unknown>, IAnyError> {
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    props.userId,
  ).pipe(
    mapParseError({
      code: 'system-runtime-selection-user-id-invalid',
      prefix: 'Failed to decode the selection userId',
    }),
  );
  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: props.aggregateName,
    recordKind: 'aggregates',
  });
  const selection = yield* getByKeyOrThrow({
    record: aggregate.selections,
    key: props.modelName,
    recordKind: `selections owned by aggregate ${props.aggregateName}`,
  });
  return yield* Effect.try({
    try: () => selection.where({ userId }),
    catch: ZerospinError.catch({
      code: 'system-runtime-selection-failed',
      message: `Selection ${props.aggregateName}.${props.modelName} threw while building its predicate`,
      extra: {
        aggregateName: props.aggregateName,
        modelName: props.modelName,
      },
    }),
  });
});
