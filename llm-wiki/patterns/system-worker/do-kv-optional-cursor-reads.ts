import { Effect } from 'effect';
import { Schema } from 'effect/Schema';

import {
  coreAbbreviations,
  makeAbbreviationIdSchema,
  mapParseError,
} from '../_stubs/schema';

/**
 * Parse optional DO KV cursor watermarks: `UndefinedOr` input, `NullOr` output.
 *
 * @bad Cast `storage.kv.get(...)` to a cursor union.
 * @bad Branch on `raw === undefined` before decode outside the schema.
 * @bad Decode with `UndefinedOr` then `?? null` at the call site.
 * @bad Use `Schema.optionalWith({ default: () => null })` for standalone KV reads.
 */
export const readLastFinalizationEventFanoutCursor = Effect.fn(
  'readLastFinalizationEventFanoutCursor',
)(function* (props: { storage: { kv: { get: (key: string) => unknown } } }) {
  const { storage } = props;
  const accountCursorIdSchema = makeAbbreviationIdSchema(
    coreAbbreviations.accountCursor,
  );

  const prevCursor = yield* Schema.decodeUnknown(
    Schema.transform(
      Schema.UndefinedOr(accountCursorIdSchema),
      Schema.NullOr(accountCursorIdSchema),
      {
        decode: cursor => cursor ?? null,
        encode: (_encoded, cursor) => cursor ?? undefined,
      },
    ),
  )(storage.kv.get('lastFinalizationEventFanoutCursor')).pipe(
    mapParseError({
      code: 'account-delta-cursor-kv-decode-failed',
      prefix: 'Failed to decode last account fanout cursor from KV',
    }),
  );

  return prevCursor;
});
