import { AggregateBrowserCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { makeAggregateBrowserCommand } from '@zerospin/core/aggregateSession/aggregateBrowserCommandsTable';
import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateBrowserCommand } from '@zerospin/core/aggregateSession/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { and, asc, desc, eq, gt, lte, or } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { aggregateActorVersionChainDbConfig } from '../aggregateActorVersionChainDbConfig.js';
/*
 * Read one ordered union of missing execution and owned results from the retained
 * ActorVAC log. Both cursors advance independently; historical results do not
 * move execution progress. Execution-only callers receive browser commands.
 *
 * 1. Validate the cursors and require admitted context for node replay.
 * 2. Scan candidates until 64 selected outputs or the end of the log.
 * 3. Decode ownership structurally and check execution contiguity.
 * 4. Project the model lock and redact other nodes' private completion fields.
 * 5. Return the whole-log publication tip independently of the page.
 */
export const getBrowserCommands = Effect.fn(
  'AggregateActorVersionChain.getBrowserCommands',
)(function* (props: {
  db: IDb;
  afterExecutedIndex: number;
  definition?: {
    name: string;
    claims: Readonly<Record<string, unknown>>;
    lock: IAggregateSessionLock;
  };
  nodeId?: string;
  afterNodeIndex?: number;
  /** Bound recovery to the state captured by a snapshot, excluding later completions. */
  throughExecutedIndex?: number;
}) {
  // 1 — node replay needs both cursor fields and the admitted definition
  if (
    !Number.isSafeInteger(props.afterExecutedIndex) ||
    props.afterExecutedIndex < 0 ||
    (props.throughExecutedIndex !== undefined &&
      (!Number.isSafeInteger(props.throughExecutedIndex) ||
        props.throughExecutedIndex < props.afterExecutedIndex)) ||
    ((props.nodeId !== undefined || props.afterNodeIndex !== undefined) &&
      (props.nodeId === undefined ||
        props.afterNodeIndex === undefined ||
        !Number.isSafeInteger(props.afterNodeIndex) ||
        props.afterNodeIndex < 0 ||
        props.definition === undefined))
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'session-replay-cursor-invalid',
        message:
          'Replay requires nonnegative cursors and admitted node context',
      }),
    );
  }

  // 2 — keep scanning after rejected ownership candidates, without short pages
  const outputs: IAggregateBrowserCommand[] = [];
  let scannedThrough = 0;
  let executedThrough = props.afterExecutedIndex;
  let nodeThrough = props.afterNodeIndex ?? 0;
  while (outputs.length < 64) {
    const rows = props.db
      .select()
      .from(aggregateActorVersionChainDbConfig.schema.browserCommands)
      .where(
        and(
          props.throughExecutedIndex === undefined
            ? undefined
            : lte(
                aggregateActorVersionChainDbConfig.schema.browserCommands
                  .executedIndex,
                props.throughExecutedIndex,
              ),
          gt(
            aggregateActorVersionChainDbConfig.schema.browserCommands
              .executedIndex,
            scannedThrough,
          ),
          or(
            gt(
              aggregateActorVersionChainDbConfig.schema.browserCommands
                .executedIndex,
              props.afterExecutedIndex,
            ),
            props.nodeId !== undefined && props.afterNodeIndex !== undefined
              ? and(
                  eq(
                    aggregateActorVersionChainDbConfig.schema.browserCommands
                      .completionNodeId,
                    props.nodeId,
                  ),
                  gt(
                    aggregateActorVersionChainDbConfig.schema.browserCommands
                      .completionNodeIndex,
                    props.afterNodeIndex,
                  ),
                )
              : undefined,
          ),
        ),
      )
      .orderBy(
        asc(
          aggregateActorVersionChainDbConfig.schema.browserCommands
            .executedIndex,
        ),
      )
      .limit(64)
      .all();
    for (const row of rows) {
      if (row.executedIndex === null) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'session-replay-invalid',
            message: 'Retained output is missing its execution position',
          }),
        );
      }
      scannedThrough = row.executedIndex;
      // 3 — JSON key order is not part of completion identity
      const decoded =
        yield* aggregateActorVersionChainDbConfig.tables.browserCommands
          .decodeRow(row)
          .pipe(
            mapParseError({
              code: 'session-replay-invalid',
              prefix: 'Invalid retained output',
            }),
          );
      const ownsCompletion =
        props.nodeId !== undefined &&
        props.definition !== undefined &&
        decoded.completionNodeId === props.nodeId &&
        decoded.completionSessionName === props.definition.name &&
        isEqual(decoded.completionClaims, props.definition.claims);
      if (row.executedIndex <= props.afterExecutedIndex && !ownsCompletion) {
        continue;
      }
      if (row.executedIndex > executedThrough) {
        if (row.executedIndex !== executedThrough + 1) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'session-replay-gap',
              message: 'Session replay has a gap',
            }),
          );
        }
        executedThrough = row.executedIndex;
      }
      const command = yield* Schema.decodeUnknownEffect(
        Schema.toType(AggregateBrowserCommandSchema),
      )(makeAggregateBrowserCommand(decoded)).pipe(
        mapParseError({
          code: 'session-replay-invalid',
          prefix: 'Invalid retained output',
        }),
      );
      // 4 — project public resources and expose only the owning completion
      const lock = props.definition?.lock;
      const delta = {
        upserted: command.delta.upserted.filter(
          resource =>
            lock === undefined ||
            Object.hasOwn(lock.models, resource.modelName),
        ),
        deleted: command.delta.deleted.filter(
          resource =>
            lock === undefined ||
            Object.hasOwn(lock.models, resource.modelName),
        ),
      };
      if (
        ownsCompletion &&
        decoded.completionNodeIndex !== null &&
        decoded.completionNodeIndex > nodeThrough
      ) {
        if (decoded.completionNodeIndex !== nodeThrough + 1) {
          return yield* makeZerospinError('node-outcome-gap');
        }
        nodeThrough = decoded.completionNodeIndex;
      }
      outputs.push({
        executedIndex: command.executedIndex,
        aggregateIndex: command.aggregateIndex,
        executedHash: command.executedHash,
        id: command.id,
        commandName: command.commandName,
        delta,
        admission: ownsCompletion ? command.admission : null,
        execution: ownsCompletion ? command.execution : null,
      });
      if (outputs.length === 64) {
        break;
      }
    }
    if (rows.length < 64) {
      break;
    }
  }

  // 5 — read the whole-log maximum independently of the returned page
  return {
    commands: outputs,
    nodeThrough,
    tip:
      props.db
        .select({
          index:
            aggregateActorVersionChainDbConfig.schema.browserCommands
              .executedIndex,
        })
        .from(aggregateActorVersionChainDbConfig.schema.browserCommands)
        .where(
          props.throughExecutedIndex === undefined
            ? undefined
            : lte(
                aggregateActorVersionChainDbConfig.schema.browserCommands
                  .executedIndex,
                props.throughExecutedIndex,
              ),
        )
        .orderBy(
          desc(
            aggregateActorVersionChainDbConfig.schema.browserCommands
              .executedIndex,
          ),
        )
        .limit(1)
        .get()?.index ?? 0,
  };
});
