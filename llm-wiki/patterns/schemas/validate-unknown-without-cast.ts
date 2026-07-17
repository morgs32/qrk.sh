import { Effect } from 'effect';
import { Schema } from 'effect/Schema';

import { mapParseError } from '../_stubs/schema';

/**
 * Schema.validate accepts unknown — do not cast input to schema Type before validate.
 *
 * @bad `Schema.validate(RequestSchema)(request as typeof RequestSchema.Type, ...)`.
 * @bad Use Schema.validate when transforms must run — prefer Schema.decodeUnknown instead.
 */
export const validateSystemApiRequest = Effect.fn('validateSystemApiRequest')(
  function* (props: { request: unknown }) {
    const validatedRequest = yield* Schema.validate(SystemApiRequestSchema)(
      props.request,
      {
        onExcessProperty: 'ignore',
      },
    ).pipe(
      mapParseError({
        code: 'failed-to-decode-system-api-request',
        prefix: 'Failed to decode SystemApi request',
      }),
    );

    return validatedRequest;
  },
);

declare const SystemApiRequestSchema: unknown;
