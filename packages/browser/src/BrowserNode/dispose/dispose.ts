import { Effect } from 'effect';

import type { BrowserNode } from '../BrowserNode.ts';

export const dispose = Effect.fn('BrowserNode.dispose')(function* (props: {
  api: BrowserNode;
}) {
  if (props.api.detached) return;
  props.api.detach?.();
  props.api.detached = true;
  props.api.subscriptionGeneration += 1;
  props.api.unsubscribe?.();
  props.api.unsubscribe = null;
  return yield* Effect.void;
});
