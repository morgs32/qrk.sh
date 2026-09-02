import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IServiceFrontendFinalizedCommand } from '@zerospin/core/serviceSession/types';
import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import { Effect } from 'effect';

import { runScheduledWork } from '../runScheduledWork/runScheduledWork.js';

export const alarm = Effect.fn('MaterializedServiceFrontendRepo.alarm')(
  function* (props: {
    db: IDb;
    finalizedCommandChain: Readonly<{
      publishCommand(props: {
        command: IEncodedCommand<IServiceFrontendFinalizedCommand>;
      }): PromiseLike<IEncodedResult<void, IAnyErrorJson>>;
    }>;
    storage: Pick<DurableObjectStorage, 'deleteAlarm' | 'setAlarm'>;
  }) {
    yield* runScheduledWork(props);
  },
);
