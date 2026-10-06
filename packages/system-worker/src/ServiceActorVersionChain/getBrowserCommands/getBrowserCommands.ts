import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { asc, desc, gt } from 'drizzle-orm';
import { Effect } from 'effect';

import { decodeServiceBrowserCommand } from '../decodeServiceBrowserCommand.js';
import { serviceActorVersionChainDbConfig } from '../serviceActorVersionChainDbConfig.js';

/** Return a contiguous selected-output suffix and its publication tip. */
export const getBrowserCommands = Effect.fn(
  'ServiceActorVersionChain.getBrowserCommands',
)(function* (props: { db: IDb; afterExecutedIndex: number }) {
  if (
    !Number.isSafeInteger(props.afterExecutedIndex) ||
    props.afterExecutedIndex < 0
  ) {
    return yield* makeZerospinError('session-replay-cursor-invalid');
  }
  const outputs = serviceActorVersionChainDbConfig.schema.browserCommands;
  const rows = props.db
    .select()
    .from(outputs)
    .where(gt(outputs.executedIndex, props.afterExecutedIndex))
    .orderBy(asc(outputs.executedIndex))
    .limit(64)
    .all();
  const pageOutputs = yield* Effect.forEach(rows, (row, i) =>
    Effect.gen(function* () {
      if (row.executedIndex !== props.afterExecutedIndex + i + 1) {
        return yield* makeZerospinError('session-replay-gap');
      }
      return yield* decodeServiceBrowserCommand(row);
    }),
  );
  return {
    commands: pageOutputs,
    tip:
      props.db
        .select({ index: outputs.executedIndex })
        .from(outputs)
        .orderBy(desc(outputs.executedIndex))
        .limit(1)
        .get()?.index ?? 0,
  };
});
