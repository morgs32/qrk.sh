import { Effect } from 'effect';

import type { BrowserSessionApi } from '../BrowserSessionApi.ts';

export const dispose = Effect.fn('BrowserSessionApi.dispose')(
  function* (props: { api: BrowserSessionApi }) {
    if (props.api.detached) return;
    props.api.detach?.();
    props.api.detached = true;
    props.api.subscriptionGeneration += 1;
    props.api.unsubscribe?.();
    props.api.unsubscribe = null;
    return yield* Effect.void;
  },
);
