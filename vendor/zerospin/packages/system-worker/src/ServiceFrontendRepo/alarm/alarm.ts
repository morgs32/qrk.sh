import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { drainServiceFrontendBlockOutbox } from '../drainServiceFrontendBlockOutbox/drainServiceFrontendBlockOutbox.js';

export const alarm = Effect.fn('ServiceFrontendRepo.alarm')(function* (props: {
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
    actorName: string;
    actorId: string;
    frontendName: string;
  };
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async> {
  yield* drainServiceFrontendBlockOutbox(props);
});
