import type { IDb } from '@zerospin/core/drizzle/types';
import { filterServiceActorOutput } from '@zerospin/core/serviceSession/filterServiceActorOutput';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { and, asc, lte, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { isEqual } from 'es-toolkit';

import { decodeActorOutput } from './decodeActorOutput.js';
import { serviceActorVersionChainDbConfig } from './serviceActorVersionChainDbConfig.js';

/** Recover private command outcomes independently of projection progress. */
export const getNodeOutcomes = Effect.fn(
  'ServiceActorVersionChain.getNodeOutcomes',
)(function* (props: {
  db: IDb;
  nodeId: string;
  sessionName: string;
  claims: Readonly<Record<string, unknown>>;
  afterNodeIndex: number;
  throughExecutedIndex: number;
  models: Readonly<Record<string, unknown>>;
}) {
  if (
    !Number.isSafeInteger(props.afterNodeIndex) ||
    props.afterNodeIndex < 0 ||
    !Number.isSafeInteger(props.throughExecutedIndex) ||
    props.throughExecutedIndex < 0
  ) {
    return yield* makeZerospinError('node-recovery-checkpoint-invalid');
  }
  const table = serviceActorVersionChainDbConfig.schema.browserCommands;
  const rows = props.db
    .select()
    .from(table)
    .where(
      and(
        lte(table.executedIndex, props.throughExecutedIndex),
        sql`json_extract(${table.caller}, '$.nodeId') = ${props.nodeId}`,
      ),
    )
    .orderBy(asc(table.executedIndex))
    .all();
  let resolvedThrough = 0;
  const outputs = [];
  for (const row of rows) {
    const decoded =
      yield* serviceActorVersionChainDbConfig.tables.browserCommands
        .decodeRow(row)
        .pipe(
          mapParseError({
            code: 'session-output-invalid',
            prefix: 'Invalid retained output',
          }),
        );
    const owner = decoded.caller;
    if (
      owner === null ||
      owner.sessionName !== props.sessionName ||
      !isEqual(owner.claims, props.claims)
    ) {
      return yield* makeZerospinError('node-recovery-caller-mismatch');
    }
    if (owner.nodeIndex !== resolvedThrough + 1) {
      return yield* makeZerospinError('node-outcome-gap');
    }
    resolvedThrough = owner.nodeIndex;
    if (resolvedThrough > props.afterNodeIndex && outputs.length < 64) {
      outputs.push(
        filterServiceActorOutput(
          yield* decodeActorOutput(row),
          props.models,
          props,
          owner,
        ),
      );
    }
  }
  if (props.afterNodeIndex > resolvedThrough) {
    return yield* makeZerospinError('node-recovery-checkpoint-invalid');
  }
  return {
    outputs,
    resolvedThrough,
    nodeThrough: Math.min(
      resolvedThrough,
      props.afterNodeIndex + outputs.length,
    ),
  };
});
