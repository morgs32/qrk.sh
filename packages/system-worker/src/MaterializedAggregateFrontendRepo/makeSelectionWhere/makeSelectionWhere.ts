import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

export const makeSelectionWhere = Effect.fn(
  'MaterializedAggregateFrontendRepo.makeSelectionWhere',
)(function* (props: {
  aggregateName: string;
  userId: string;
  modelName: string;
}): Effect.fn.Return<Record<string, unknown>, IAnyError> {
  const { aggregateName, modelName, userId } = props;
  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: aggregateName,
    recordKind: 'aggregates',
  });
  const selection = yield* getByKeyOrThrow({
    record: aggregate.selections,
    key: modelName,
    recordKind: `selections owned by aggregate ${aggregateName}`,
  });
  return yield* Effect.try({
    try: () => selection.where({ userId }),
    catch: ZerospinError.catch({
      code: 'system-runtime-selection-failed',
      message: `Selection ${aggregateName}.${modelName} threw while building its predicate`,
      extra: {
        aggregateName,
        modelName,
      },
    }),
  });
});
