import { Effect } from 'effect';

/**
 * Yield `ZerospinError` directly from Effect.gen — no redundant Effect.fail wrapper.
 *
 * @bad Wrap yieldable ZerospinError in `Effect.fail(new ZerospinError(...))`.
 */
export const loadDeployRecord = Effect.fn('loadDeployRecord')(
  function* (props: { systemId: string; row: unknown | null }) {
    if (!props.row) {
      return yield* new ZerospinError({
        code: 'no-deploy-for-system',
        message: 'No deploy record exists for this system',
        status: 404,
        extra: { systemId: props.systemId },
      });
    }

    return props.row;
  },
);

declare class ZerospinError {
  constructor(props: {
    code: string;
    message: string;
    status?: number;
    extra?: unknown;
  });
}
