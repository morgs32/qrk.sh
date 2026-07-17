import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { drainAccountOutboxes } from '../drainAccountOutboxes/drainAccountOutboxes.js';

export const alarm = Effect.fn('AccountRepo.alarm')(function* (props: {
  accountRepoName: string;
  generationId: string;
  accountId: string;
  accountName: string;
  db: IDb;
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async> {
  yield* drainAccountOutboxes(props);
});
