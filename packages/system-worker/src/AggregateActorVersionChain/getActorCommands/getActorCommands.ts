import { AggregateActorCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateActorCommand } from '@zerospin/core/aggregateSession/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { and, asc, desc, eq, gt, or } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { aggregateActorVersionChainDbConfig } from '../aggregateActorVersionChainDbConfig.js';
import { projectActorCommand } from '../projectActorCommand.js';
/*
 * Read one ordered union of missing execution and owned results from the retained
 * ActorVAC log. Both cursors advance independently; historical results do not
 * move execution progress. Execution-only callers receive redacted commands.
 *
 * 1. Validate the cursors and require admitted context for node replay.
 * 2. Scan candidates until 64 selected commands or the end of the log.
 * 3. Decode ownership structurally and check execution contiguity.
 * 4. Project the model lock and redact other nodes' private completion fields.
 * 5. Return the whole-log publication tip independently of the page.
 */
export const getActorCommands = Effect.fn(
  'AggregateActorVersionChain.getActorCommands',
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
}) {
  // 1 — node replay needs both cursor fields and the admitted definition
  if (
    !Number.isSafeInteger(props.afterExecutedIndex) ||
    props.afterExecutedIndex < 0 ||
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
  const commands: IAggregateActorCommand[] = [];
  let scannedThrough = 0;
  let executedThrough = props.afterExecutedIndex;
  while (commands.length < 64) {
    const rows = props.db
      .select()
      .from(aggregateActorVersionChainDbConfig.schema.commands)
      .where(
        and(
          gt(
            aggregateActorVersionChainDbConfig.schema.commands.executedIndex,
            scannedThrough,
          ),
          or(
            gt(
              aggregateActorVersionChainDbConfig.schema.commands.executedIndex,
              props.afterExecutedIndex,
            ),
            props.nodeId !== undefined && props.afterNodeIndex !== undefined
              ? and(
                  eq(
                    aggregateActorVersionChainDbConfig.schema.commands
                      .completionNodeId,
                    props.nodeId,
                  ),
                  gt(
                    aggregateActorVersionChainDbConfig.schema.commands
                      .completionNodeIndex,
                    props.afterNodeIndex,
                  ),
                )
              : undefined,
          ),
        ),
      )
      .orderBy(
        asc(aggregateActorVersionChainDbConfig.schema.commands.executedIndex),
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
      const decoded = yield* aggregateActorVersionChainDbConfig.tables.commands
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
        Schema.toType(AggregateActorCommandSchema),
      )(projectActorCommand(decoded)).pipe(
        mapParseError({
          code: 'session-replay-invalid',
          prefix: 'Invalid retained output',
        }),
      );
      // 4 — project public resources and expose only the owning completion
      const lock = props.definition?.lock;
      commands.push({
        id: command.id,
        nodeId: ownsCompletion ? command.nodeId : null,
        nodeIndex: ownsCompletion ? command.nodeIndex : null,
        aggregateIndex: command.aggregateIndex,
        executedIndex: command.executedIndex,
        executedHash: command.executedHash,
        actorDelta: {
          upserted: command.actorDelta.upserted.filter(
            resource =>
              lock === undefined ||
              Object.hasOwn(lock.models, resource.modelName),
          ),
          deleted: command.actorDelta.deleted.filter(
            resource =>
              lock === undefined ||
              Object.hasOwn(lock.models, resource.modelName),
          ),
        },
        admission: ownsCompletion ? command.admission : null,
        execution: ownsCompletion ? command.execution : null,
      });
      if (commands.length === 64) break;
    }
    if (rows.length < 64) break;
  }

  // 5 — read the whole-log maximum independently of the returned page
  return {
    commands,
    tip:
      props.db
        .select({
          index:
            aggregateActorVersionChainDbConfig.schema.commands.executedIndex,
        })
        .from(aggregateActorVersionChainDbConfig.schema.commands)
        .orderBy(
          desc(
            aggregateActorVersionChainDbConfig.schema.commands.executedIndex,
          ),
        )
        .limit(1)
        .get()?.index ?? 0,
  };
});
