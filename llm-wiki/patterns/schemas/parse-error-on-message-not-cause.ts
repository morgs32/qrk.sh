import { Effect } from 'effect';
import { Schema } from 'effect/Schema';

import { mapParseError } from '../_stubs/schema';

/**
 * ParseError details belong on ZerospinError.message — cause stays null | string only.
 *
 * @bad Static message hiding parse detail; set cause to ParseError object.
 * @bad message: err.message alone without stable prefix tied to code.
 */
export const loadSystemDefinition = Effect.fn('loadSystemDefinition')(
  function* (props: unknown) {
    const validated = yield* Schema.validate(
      Schema.Struct({ systemName: Schema.String }),
    )(props, { onExcessProperty: 'ignore' }).pipe(
      mapParseError({
        code: 'failed-to-decode-load-system-definition-props',
        prefix: 'Failed to decode loadSystemDefinition props',
      }),
    );

    return fetchSystemDefinition(validated.systemName);
  },
);

declare function fetchSystemDefinition(
  systemName: string,
): Effect.Effect<unknown, unknown, unknown>;
