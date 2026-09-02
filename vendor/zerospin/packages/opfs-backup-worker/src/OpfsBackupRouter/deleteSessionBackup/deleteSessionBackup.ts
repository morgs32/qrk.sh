import type { ISessionId } from '@zerospin/core/session/types';
import { Effect } from 'effect';

import type { OpfsBackupRouterApi } from '../OpfsBackupRouterApi.ts';

export const deleteSessionBackup = Effect.fn(
  'OpfsBackupRouterApi.deleteSessionBackup',
)(function* (props: {
  api: OpfsBackupRouterApi;
  backupKey: string;
  sessionId: ISessionId;
}) {
  return yield* props.api.routeRequest<'deleted' | 'missing' | 'in-use'>(api =>
    api.deleteSessionBackup({
      backupClientId: props.api.backupClientId,
      backupKey: props.backupKey,
      sessionId: props.sessionId,
    }),
  );
});
