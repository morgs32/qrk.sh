import { makeAggregateBrowserCommand } from '@zerospin/core/aggregateSession/aggregateBrowserCommandsTable';
import type { IAggregateBrowserCommand } from '@zerospin/core/aggregateSession/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { isEqual } from 'es-toolkit';

import { aggregateActorVersionChainDbConfig } from '../aggregateActorVersionChainDbConfig.js';

const retainBrowserCommands = makeTx(
  'AggregateActorVersionChain.retainBrowserCommands',
)(function* (
  tx: ITx<typeof aggregateActorVersionChainDbConfig>,
  rows: readonly (typeof aggregateActorVersionChainDbConfig.schema.browserCommands.$inferSelect)[],
) {
  const { browserCommands: outputs } =
    aggregateActorVersionChainDbConfig.schema;
  const retained: {
    output: IAggregateBrowserCommand;
    claims: Readonly<Record<string, unknown>> | null;
    sessionName: string | null;
    nodeId: string | null;
  }[] = [];
  let previous = tx
    .select()
    .from(outputs)
    .orderBy(desc(outputs.executedIndex))
    .limit(1)
    .get();
  for (const row of rows) {
    const decoded =
      yield* aggregateActorVersionChainDbConfig.tables.browserCommands
        .decodeRow(row)
        .pipe(
          mapParseError({
            code: 'session-output-invalid',
            prefix: 'Invalid actor output',
          }),
        );
    const { completionClaims: claims } = decoded;
    const output = makeAggregateBrowserCommand(decoded);
    if (
      row.executedIndex !== output.executedIndex ||
      row.aggregateIndex !== output.aggregateIndex ||
      row.executedHash !== output.executedHash
    ) {
      return yield* makeZerospinError('session-output-identity-mismatch');
    }
    if (
      (claims === null) !== (row.completionSessionName === null) ||
      (claims === null) !== (row.completionNodeId === null) ||
      (claims === null) !== (row.completionNodeIndex === null) ||
      (claims === null &&
        (output.admission !== null || output.execution !== null))
    ) {
      return yield* makeZerospinError(
        'session-output-completion-owner-invalid',
      );
    }
    const existing = tx
      .select()
      .from(outputs)
      .where(eq(outputs.executedIndex, row.executedIndex))
      .get();
    if (existing !== undefined) {
      if (!isEqual(existing, row)) {
        return yield* makeZerospinError('session-output-identity-mismatch');
      }
    } else {
      if (row.executedIndex !== (previous?.executedIndex ?? 0) + 1) {
        return yield* makeZerospinError('session-output-index-gap');
      }
      if (row.aggregateIndex < (previous?.aggregateIndex ?? 0)) {
        return yield* makeZerospinError('session-output-watermark-regression');
      }
      tx.insert(outputs).values(row).run();
      previous = row;
    }
    retained.push({
      output,
      claims,
      sessionName: decoded.completionSessionName,
      nodeId: decoded.completionNodeId,
    });
  }
  return retained;
});

/** Retain the whole publication page before any output is broadcast. */
export const receiveBrowserCommands = Effect.fn(
  'AggregateActorVersionChain.receiveBrowserCommands',
)(function* (props: {
  rows: readonly (typeof aggregateActorVersionChainDbConfig.schema.browserCommands.$inferSelect)[];
  db: IDb<typeof aggregateActorVersionChainDbConfig>;
  broadcast(props: {
    output: IAggregateBrowserCommand;
    claims: Readonly<Record<string, unknown>> | null;
    sessionName: string | null;
    nodeId: string | null;
  }): void;
}) {
  const retained = yield* retainBrowserCommands(props.db, props.rows);
  for (const output of retained) {
    props.broadcast(output);
  }
});
