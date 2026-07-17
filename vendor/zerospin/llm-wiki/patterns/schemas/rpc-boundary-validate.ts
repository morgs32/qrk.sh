import { Effect } from 'effect';
import { Schema } from 'effect/Schema';

import { mapParseError } from '../_stubs/schema';

/**
 * RPC boundaries default to onExcessProperty ignore during rolling updates.
 *
 * @bad Use onExcessProperty error at RPC boundary unless strict rejection is required.
 */
export const validateRpcProps = Effect.fn('validateRpcProps')(function* (
  props: unknown,
) {
  const validated = yield* Schema.validate(
    Schema.Struct({ systemId: Schema.String }),
  )(props, { onExcessProperty: 'ignore' });

  return validated;
});

/**
 * Inline one-off RPC props Schema.Struct in the Api method — no file-level schema const.
 *
 * @bad Top-level `enqueueSomeWorkflowPropsSchema` used by only one method.
 */
export const enqueueSomeWorkflow = Effect.fn('enqueueSomeWorkflow')(function* (
  props: unknown,
) {
  const validated = yield* Schema.validate(
    Schema.Struct({
      zerospinApiKey: Schema.String,
      workflowId: Schema.String,
    }),
  )(props, { onExcessProperty: 'ignore' }).pipe(
    mapParseError({
      code: 'failed-to-decode-enqueue-workflow-props',
      prefix: 'Failed to decode enqueueSomeWorkflow props',
    }),
  );

  return spawnWorkflow(validated);
});

declare function spawnWorkflow(
  props: unknown,
): Effect.Effect<unknown, unknown, unknown>;
