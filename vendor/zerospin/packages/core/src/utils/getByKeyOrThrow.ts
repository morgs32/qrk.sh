import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

export const getByKeyOrThrow = Effect.fn('getByKeyOrThrow')(function* <
  RECORD extends Record<string, unknown>,
  KEY extends keyof RECORD & string,
>(props: {
  record: RECORD;
  /** Literal keys preserve narrow return types; `string` is for RPC/wire lookups at runtime. */
  key: KEY | string;
  recordKind: string;
}): Effect.fn.Return<NonNullable<RECORD[KEY]>, IAnyError> {
  const { record, key, recordKind } = props;
  if (!(key in record)) {
    return yield* new ZerospinError(`${recordKind}-not-found`);
  }
  const value = record[key as KEY];
  if (!value || value === null) {
    return yield* new ZerospinError(`${recordKind}-not-found`);
  }
  return value;
});
