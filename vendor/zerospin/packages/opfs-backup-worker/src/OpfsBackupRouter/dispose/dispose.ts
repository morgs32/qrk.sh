import { Effect } from 'effect';

import type { OpfsBackupRouterApi } from '../OpfsBackupRouterApi.ts';

export const dispose = Effect.fn('OpfsBackupRouterApi.dispose')(
  function* (props: { api: OpfsBackupRouterApi }) {
    yield* props.api.release();
  },
);
