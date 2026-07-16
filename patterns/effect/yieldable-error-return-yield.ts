import { Effect } from 'effect';

declare class DomainError extends Error {
  constructor(props: {
    code: string;
    message?: string;
    status?: number;
    extra?: unknown;
  });
  pipe(...ops: unknown[]): unknown;
}

/**
 * Yield yieldable domain errors with `return yield*` — not `Effect.fail` around an already-yieldable instance.
 *
 * @bad `return yield* Effect.fail(new DomainError({ code: 'not-found', … }))`.
 */
export const requireDeployRow = Effect.fn('requireDeployRow')(
  function* (props: { row: { id: string } | null; systemId: string }) {
    const { row, systemId } = props;

    if (!row) {
      return yield* new DomainError({
        code: 'no-deploy-for-system',
        message: 'No deploy record exists for this system',
        status: 404,
        extra: { systemId },
      });
    }

    return row;
  },
);
