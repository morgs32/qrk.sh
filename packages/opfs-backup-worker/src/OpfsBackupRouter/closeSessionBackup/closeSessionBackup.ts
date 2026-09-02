import type { ISessionId } from '@zerospin/core/session/types';
import { Effect } from 'effect';

import type { OpfsBackupRouterApi } from '../OpfsBackupRouterApi.ts';

export const closeSessionBackup = Effect.fn(
  'OpfsBackupRouterApi.closeSessionBackup',
)(function* (props: {
  api: OpfsBackupRouterApi;
  backupKey: string;
  sessionId: ISessionId;
}) {
  return yield* props.api.routeRequest<void>(api =>
    api.closeSessionBackup({
      backupClientId: props.api.backupClientId,
      backupKey: props.backupKey,
      sessionId: props.sessionId,
    }),
  );
});
