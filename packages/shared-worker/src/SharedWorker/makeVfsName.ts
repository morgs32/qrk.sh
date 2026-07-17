import { Effect } from 'effect';

export const makeVfsName = Effect.fn('makeVfsName')(function* (props: {
  systemId: string;
  generationId: string;
  userId: string;
}) {
  const { systemId, generationId, userId } = props;
  yield* Effect.void;
  return `zerospin/${systemId}/${generationId}/users/${userId}`;
});
