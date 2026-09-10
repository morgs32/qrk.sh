import { Effect } from 'effect';

import { dispose as disposeDb } from '../../BackupDbApi/dispose/dispose.ts';
import type { BackupWorkerApi } from '../BackupWorkerApi.ts';

export const dispose = Effect.fn('BackupWorkerApi.dispose')(function* (props: {
  api: BackupWorkerApi;
}) {
  const { api } = props;
  api.disposed = true;
  for (const { target } of api.targets.values()) {
    yield* disposeDb({ api: target }).pipe(Effect.ignore);
  }
});
