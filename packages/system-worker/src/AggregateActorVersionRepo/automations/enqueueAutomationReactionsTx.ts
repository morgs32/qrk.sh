import type { IAnyAggregateActorVersion } from '@zerospin/core/aggregateActor/types';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import type { ITx } from '@zerospin/core/drizzle/types';
import { mapParseError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { aggregateActorVersionRepoDbConfig } from '../aggregateActorVersionRepoDbConfig.js';

import type { makeAutomationCommandId } from './makeAutomationCommandId.js';

/** Called in the same transaction that projects the successful selected change. */
export const enqueueAutomationReactionsTx = Effect.fn(
  'enqueueAutomationReactionsTx',
)(
  function* (props: {
    tx: ITx;
    actor: IAnyAggregateActorVersion;
    command: IEncodedCommand<IAggregateCommand>;
    executedIndex: number;
    key: Parameters<typeof makeAutomationCommandId>[0]['key'];
  }) {
    const { tx, actor, command, executedIndex } = props;
    const tables = aggregateActorVersionRepoDbConfig.schema;
    const state = tx
      .select()
      .from(tables.automationState)
      .where(eq(tables.automationState.id, 1))
      .get();
    if (state === undefined || executedIndex <= state.startIndex) return;
    let enrolled = false;
    for (const automation of Object.values(actor.automations)) {
      if (automation.on.commandName !== command.commandName) continue;
      let version = automation.on;
      while (
        version.version !== command.contractVersion &&
        version.previous !== undefined
      ) {
        version = version.previous;
      }
      if (version.version !== command.contractVersion) continue;
      if (!enrolled) {
        tx.insert(tables.automationGroups)
          .values({ executedIndex, status: 'open' })
          .onConflictDoNothing()
          .run();
        enrolled = true;
      }
      tx.insert(tables.automationRuns)
        .values(
          yield* aggregateActorVersionRepoDbConfig.tables.automationRuns.encodeRow(
            {
              executedIndex,
              automationName: automation.name,
              programStatus: 'pending',
              outputCommandRowId: null,
              programFailure: null,
              stagingFailure: null,
            },
          ),
        )
        .onConflictDoNothing()
        .run();
    }
  },
  mapParseError({
    code: 'automation-reaction-encode-failed',
    prefix: 'Invalid automation reaction',
  }),
);
