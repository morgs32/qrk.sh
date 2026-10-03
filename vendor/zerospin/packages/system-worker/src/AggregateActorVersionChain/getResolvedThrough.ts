import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { and, asc, eq, lte } from 'drizzle-orm';
import { Effect } from 'effect';
import { isEqual } from 'es-toolkit';

import { aggregateActorVersionChainDbConfig } from './aggregateActorVersionChainDbConfig.js';

/** Snapshot outcome prefixes come from durable receiving history, never the deleted delivery queue. */
export const getResolvedThrough = Effect.fn(
  'AggregateActorVersionChain.getResolvedThrough',
)(function* (props: {
  db: IDb;
  nodeId: string;
  sessionName: string;
  claims: Readonly<Record<string, unknown>>;
  throughExecutedIndex: number;
}) {
  if (
    !Number.isSafeInteger(props.throughExecutedIndex) ||
    props.throughExecutedIndex < 0
  ) {
    return yield* makeZerospinError('node-recovery-checkpoint-invalid');
  }
  const table = aggregateActorVersionChainDbConfig.schema.browserCommands;
  const rows = props.db
    .select()
    .from(table)
    .where(
      and(
        eq(table.completionNodeId, props.nodeId),
        lte(table.executedIndex, props.throughExecutedIndex),
      ),
    )
    .orderBy(asc(table.completionNodeIndex))
    .all();
  let resolvedThrough = 0;
  for (const row of rows) {
    const decoded =
      yield* aggregateActorVersionChainDbConfig.tables.browserCommands
        .decodeRow(row)
        .pipe(
          mapParseError({
            code: 'session-output-invalid',
            prefix: 'Invalid retained browser command',
          }),
        );
    if (
      decoded.completionSessionName !== props.sessionName ||
      !isEqual(decoded.completionClaims, props.claims)
    ) {
      return yield* makeZerospinError('node-recovery-caller-mismatch');
    }
    if (decoded.completionNodeIndex !== resolvedThrough + 1) {
      return yield* makeZerospinError('node-outcome-gap');
    }
    resolvedThrough += 1;
  }
  return resolvedThrough;
});
