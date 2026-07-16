import { Effect } from 'effect';

declare function findFirst(
  props: unknown,
): Effect.Effect<unknown, never, never>;

/**
 * Inline Effects that exist only to be yielded on the next line.
 *
 * @bad `const findFirstEffect = findFirst(...); const result = yield* findFirstEffect`.
 */
export const loadUser = Effect.fn('loadUser')(function* () {
  const findFirstResult = yield* findFirst({
    modelName: 'user',
    query: { where: { id: { eq: 'usr_123' } } },
  });
  return findFirstResult;
});

/**
 * Typecheck-only calls still use yield* directly in Effect.gen.
 *
 * @bad Assign to a local and `void` it instead of yielding.
 */
export const typecheckInvalidModel = Effect.fn('typecheckInvalidModel')(
  function* () {
    yield* findFirst({
      // @ts-expect-error model key must exist
      modelName: 'account',
      query: {},
    });
  },
);
