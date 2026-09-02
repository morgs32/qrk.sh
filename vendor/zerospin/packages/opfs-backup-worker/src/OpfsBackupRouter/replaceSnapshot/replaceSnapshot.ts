import type { ISessionId } from '@zerospin/core/session/types';
import { Effect } from 'effect';

import type { OpfsBackupRouterApi } from '../OpfsBackupRouterApi.ts';

export const replaceSnapshot = Effect.fn('OpfsBackupRouterApi.replaceSnapshot')(
  function* (props: {
    api: OpfsBackupRouterApi;
    backupKey: string;
    sessionId: ISessionId;
    snapshot: Uint8Array;
  }) {
    return yield* props.api.routeRequest<void>(api =>
      api.replaceSnapshot({
        backupClientId: props.api.backupClientId,
        backupKey: props.backupKey,
        sessionId: props.sessionId,
        snapshot: props.snapshot,
      }),
    );
  },
);
