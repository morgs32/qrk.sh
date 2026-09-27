import { Effect, Schema } from 'effect';

import { mapParseError } from '../_stubs/schema';

/**
 * Schema.decodeUnknownEffect accepts unknown — do not cast input before decoding.
 *
 * @bad `Schema.decodeEffect(RequestSchema)(request as typeof RequestSchema.Type, ...)` at a trust boundary.
 * @bad Use `Schema.toType` at a wire boundary where schema transformations must run.
 */
export const validateSystemApiRequest = Effect.fn('validateSystemApiRequest')(
  function* (props: { request: unknown }) {
    const validatedRequest = yield* Schema.decodeUnknownEffect(
      SystemApiRequestSchema,
    )(props.request, {
      onExcessProperty: 'ignore',
    }).pipe(
      mapParseError({
        code: 'failed-to-decode-system-api-request',
        prefix: 'Failed to decode SystemApi request',
      }),
    );

    return validatedRequest;
  },
);

declare const SystemApiRequestSchema: unknown;
