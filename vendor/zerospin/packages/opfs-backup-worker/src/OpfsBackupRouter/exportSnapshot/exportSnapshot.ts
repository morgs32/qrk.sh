import type { ISessionId } from '@zerospin/core/session/types';
import { Effect } from 'effect';

import type { OpfsBackupRouterApi } from '../OpfsBackupRouterApi.ts';

export const exportSnapshot = Effect.fn('OpfsBackupRouterApi.exportSnapshot')(
  function* (props: {
    api: OpfsBackupRouterApi;
    backupKey: string;
    sessionId: ISessionId;
  }) {
    return yield* props.api.routeRequest<Uint8Array | null>(api =>
      api.exportSnapshot({
        backupClientId: props.api.backupClientId,
        backupKey: props.backupKey,
        sessionId: props.sessionId,
      }),
    );
  },
);
