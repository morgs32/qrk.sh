import { Effect } from 'effect';

declare const repo: {
  publish: (props: { id: string }) => Promise<{ ok: true; id: string }>;
};

/**
 * Named Effect.fn procedures for observability in traces and fiber stacks.
 *
 * @bad Anonymous Effect.gen at the runtime boundary hiding where behavior is defined.
 */
export const publish = Effect.fn('ResourceRepo.publish')(function* (props: {
  id: string;
}) {
  return yield* Effect.promise(() => repo.publish(props));
});

export const publishUntraced = Effect.fnUntraced(
  'ResourceRepo.publishUntraced',
)(function* (props: { id: string }) {
  return yield* Effect.promise(() => repo.publish(props));
});
