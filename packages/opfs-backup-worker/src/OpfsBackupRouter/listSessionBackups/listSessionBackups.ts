import type { ISessionId } from '@zerospin/core/session/types';
import { Effect } from 'effect';

import type { OpfsBackupRouterApi } from '../OpfsBackupRouterApi.ts';

export const listSessionBackups = Effect.fn(
  'OpfsBackupRouterApi.listSessionBackups',
)(function* (props: { api: OpfsBackupRouterApi; backupKey: string }) {
  return yield* props.api.routeRequest<readonly ISessionId[]>(api =>
    api.listSessionBackups({
      backupClientId: props.api.backupClientId,
      backupKey: props.backupKey,
    }),
  );
});
