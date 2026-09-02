import { Effect, Schema } from 'effect';

/**
 * Keep RPC prop validation inside the Api instance method that receives wire props.
 *
 * @bad Thin async wrapper that forwards unknown props to a sibling Effect.fn that validates.
 */
export class SystemApi {
  enqueueSomeWorkflow = Effect.fn('SystemApi.enqueueSomeWorkflow')(function* (
    props: unknown,
  ) {
    const validated = yield* Schema.decodeUnknownEffect(
      Schema.Struct({ workflowId: Schema.String }),
    )(props, { onExcessProperty: 'ignore' });

    return createSomeWorkflow(validated);
  });
}

declare function createSomeWorkflow(props: {
  workflowId: string;
}): Effect.Effect<unknown, unknown, unknown>;
