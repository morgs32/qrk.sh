import { Effect } from 'effect';
import { Schema } from 'effect/Schema';

import { mapParseError } from '../_stubs/schema';

/**
 * Use mapParseError for Schema validate/decode/encode failures on RPC and CLI surfaces.
 *
 * @bad Inline err.message with full schema AST dump.
 * @bad Set cause: err for ParseError (hidden on encoded RPC errors).
 * @bad Duplicate ParseResult.TreeFormatter at every call site.
 */
export const validateStoredRow = (row: unknown) =>
  Schema.decodeUnknown(rowSchema)(row, { onExcessProperty: 'ignore' }).pipe(
    Effect.flatMap(decoded => Schema.encode(rowSchema)(decoded)),
    mapParseError({
      code: 'failed-to-validate-stored-row',
      prefix: 'Stored row failed validation',
    }),
  );

declare const rowSchema: unknown;
declare const Effect: {
  flatMap: (effect: unknown, fn: (a: unknown) => unknown) => unknown;
};
