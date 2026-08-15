import { Effect } from 'effect';
import { Schema } from 'effect/Schema';

import {
  coreAbbreviations,
  makeAbbreviationIdSchema,
  mapParseError,
} from '../_stubs/schema';

/**
 * Decode a repo-local cursor as `undefined | null | cursor` so bootstrap absence and an empty upstream remain distinct.
 *
 * @bad Cast `storage.kv.get(...)` to a cursor union.
 * @bad Collapse `undefined` and `null` before callers apply their explicit default policy.
 * @bad Decode the raw KV value with a cursor-only schema.
 */
export const getLastAggregateCursor = Effect.fn('getLastAggregateCursor')(
  function* (props: { storage: { kv: { get: (key: string) => unknown } } }) {
    const aggregateCursorSchema = makeAbbreviationIdSchema(
      coreAbbreviations.aggregateCursor,
    );

    return yield* Schema.decodeUnknown(
      Schema.UndefinedOr(Schema.NullOr(aggregateCursorSchema)),
    )(props.storage.kv.get('lastAggregateCursor')).pipe(
      mapParseError({
        code: 'getLastAggregateCursor-invalid-lastAggregateCursor',
        prefix: 'Failed to decode the last aggregate cursor from KV',
      }),
    );
  },
);
