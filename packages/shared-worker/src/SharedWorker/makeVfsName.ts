import { Effect } from 'effect';

export const makeVfsName = Effect.fn('makeVfsName')(function* (props: {
  systemId: string;
  userId: string;
}) {
  const { systemId, userId } = props;
  yield* Effect.void;
  return `zerospin/056/${systemId}/users/${userId}`;
});
