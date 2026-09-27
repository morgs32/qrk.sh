import { Effect, Schema } from 'effect';

import { mapParseError } from '../_stubs/schema';

/**
 * SchemaError details belong on ZerospinError.message — cause stays null | string only.
 *
 * @bad Use a static message that hides issue detail or assign the SchemaError object to cause.
 * @bad Use `error.message` alone without a stable prefix tied to the error code.
 */
export const loadSystemDefinition = Effect.fn('loadSystemDefinition')(
  function* (props: unknown) {
    const validated = yield* Schema.decodeUnknownEffect(
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
