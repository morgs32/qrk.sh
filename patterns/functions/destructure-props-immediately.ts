import { Effect } from 'effect';

/**
 * Keep `props` as the only function argument, then destructure on the first line of the body.
 *
 * @bad Parameter destructuring: `function* ({ actorId, db })` — take `props`, then `const { … } = props`.
 * @bad Chain property access directly off `props` through the whole body.
 */
export const authenticate = Effect.fn('authenticate')(function* (props: {
  actorId: string;
  db: { query: unknown };
}) {
  const { actorId, db } = props;
  return { actorId, db };
});
