import type { IAggregateStageFailure } from '../types.ts';

const listenersBySession = new WeakMap<
  object,
  Set<(event: IAggregateStageFailure) => void>
>();

export function onStageFailure(
  session: object,
  handler: (event: IAggregateStageFailure) => void,
) {
  let listeners = listenersBySession.get(session);
  if (listeners === undefined) {
    listeners = new Set();
    listenersBySession.set(session, listeners);
  }
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

export function notifyStageFailure(
  session: object,
  event: IAggregateStageFailure,
) {
  for (const listener of [...(listenersBySession.get(session) ?? [])]) {
    try {
      listener(event);
    } catch (error) {
      console.error('Aggregate session failure observer threw', error);
    }
  }
}
