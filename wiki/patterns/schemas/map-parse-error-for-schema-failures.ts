import { Effect, Schema } from 'effect';

import { mapParseError } from '../_stubs/schema';

/**
 * Use mapParseError for Schema decode and encode failures on RPC and CLI surfaces.
 *
 * @bad Inline err.message with full schema AST dump.
 * @bad Set cause to the SchemaError object (hidden on encoded RPC errors).
 * @bad Duplicate `SchemaIssue.makeFormatterDefault` at every call site.
 */
export const validateStoredRow = (row: unknown) =>
  Schema.decodeUnknownEffect(rowSchema)(row, {
    onExcessProperty: 'ignore',
  }).pipe(
    Effect.flatMap(decoded => Schema.encodeEffect(rowSchema)(decoded)),
    mapParseError({
      code: 'failed-to-validate-stored-row',
      prefix: 'Stored row failed validation',
    }),
  );

declare const rowSchema: unknown;
