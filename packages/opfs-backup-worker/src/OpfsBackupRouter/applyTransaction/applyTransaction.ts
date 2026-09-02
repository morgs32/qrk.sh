import type { ICommittedSqlStatement } from '@zerospin/core/drizzle/WaSqliteSession';
import type { ISessionId } from '@zerospin/core/session/types';
import { Effect } from 'effect';

import type { OpfsBackupRouterApi } from '../OpfsBackupRouterApi.ts';

export const applyTransaction = Effect.fn(
  'OpfsBackupRouterApi.applyTransaction',
)(function* (props: {
  api: OpfsBackupRouterApi;
  backupKey: string;
  sessionId: ISessionId;
  statements: readonly ICommittedSqlStatement[];
}) {
  return yield* props.api.routeRequest<void>(api =>
    api.applyTransaction({
      backupClientId: props.api.backupClientId,
      backupKey: props.backupKey,
      sessionId: props.sessionId,
      statements: props.statements,
    }),
  );
});
