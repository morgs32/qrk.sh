import { Effect, SubscriptionRef } from 'effect';

export const makeHandleStore = <HANDLE>(props: {
  readonly initialHandle: HANDLE;
}) => {
  // SubscriptionRef.make is a known-synchronous allocation. Keeping this
  // narrow runSync preserves its replay protocol for synchronous Actors.
  const handleRef = Effect.runSync(
    SubscriptionRef.make(props.initialHandle),
  );

  const getHandle = (): Effect.Effect<HANDLE> =>
    SubscriptionRef.get(handleRef);
  const publish = (handle: HANDLE): Effect.Effect<void> =>
    SubscriptionRef.set(handleRef, handle);

  return {
    getHandle,
    handleStream: SubscriptionRef.changes(handleRef),
    publish,
  };
};
