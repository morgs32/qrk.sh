import { Effect } from 'effect';

declare class DomainError extends Error {
  constructor(props: { code: string; message: string });
  pipe(...ops: unknown[]): unknown;
}

/**
 * Access controls: fail in the explicit reject branch; positive path is fallthrough.
 *
 * @bad Inverted guard — `if (payload.name !== 'invalid') return Effect.void` then fail on reject.
 */
export const createListGuard = Effect.fn('createListGuard')(function* (props: {
  payload: { name: string };
}) {
  const { payload } = props;

  if (payload.name === 'invalid-name') {
    return yield* new DomainError({
      code: 'list-name-rejected',
      message: `List name is rejected: ${payload.name}`,
    });
  }
});

export const accessControls = {
  createList: [createListGuard],
};
