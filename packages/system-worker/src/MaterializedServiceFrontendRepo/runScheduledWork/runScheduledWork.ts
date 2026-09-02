import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IServiceFrontendFinalizedCommand } from '@zerospin/core/serviceSession/types';
import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import { isNull } from 'drizzle-orm';
import { Effect, Result } from 'effect';

import { materializedServiceFrontendRepoDrizzleSchemas } from '../MaterializedServiceFrontendRepoDbConfig.js';
import { publishFinalizedCommands } from '../publishFinalizedCommands/publishFinalizedCommands.js';

export const runScheduledWork = Effect.fn(
  'MaterializedServiceFrontendRepo.runScheduledWork',
)(function* (props: {
  db: IDb;
  finalizedCommandChain: Readonly<{
    publishCommand(props: {
      command: IEncodedCommand<IServiceFrontendFinalizedCommand>;
    }): PromiseLike<IEncodedResult<void, IAnyErrorJson>>;
  }>;
  storage: Pick<DurableObjectStorage, 'deleteAlarm' | 'setAlarm'>;
}) {
  const published = yield* publishFinalizedCommands({
    db: props.db,
    finalizedCommandChain: props.finalizedCommandChain,
  }).pipe(Effect.result);
  const pending =
    props.db
      .select({
        serviceFrontendIndex:
          materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox
            .serviceFrontendIndex,
      })
      .from(
        materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox,
      )
      .where(
        isNull(
          materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox
            .publishedAt,
        ),
      )
      .get() !== undefined;
  yield* Effect.promise(() =>
    pending || Result.isFailure(published)
      ? props.storage.setAlarm(Date.now() + 1_000)
      : props.storage.deleteAlarm(),
  );
  if (Result.isFailure(published)) {
    return yield* published.failure;
  }
  return { pending };
});
