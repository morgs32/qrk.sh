import { Effect } from 'effect';

export const makeVfsName = Effect.fn('makeVfsName')(function* (props: {
  systemId: string;
  generationId: string;
  partitionKey: string;
}) {
  const { systemId, generationId, partitionKey } = props;
  yield* Effect.void;
  return `zerospin/${systemId}/${generationId}/partitions/${partitionKey}`;
});
