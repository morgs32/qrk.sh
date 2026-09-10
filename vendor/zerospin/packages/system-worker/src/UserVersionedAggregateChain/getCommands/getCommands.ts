import type { IDb } from '@zerospin/core/drizzle/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { AggregateFrontendFinalizedCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { and, asc, desc, gt, inArray, lte } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { userVersionedAggregateChainDbConfig } from '../userVersionedAggregateChainDbConfig.js';
/*
 * Frontend reconnects and snapshot publication checks read the retained UVAC
 * log. Replay returns a contiguous page; snapshot reconciliation selects only
 * requested command IDs through the captured cursor. Both return the current tip.
 *
 * 1. Validate the replay cursor.
 * 2. Select retained user output.
 * 3. Read a replay page or indexed reconciliation results.
 * 4. Check replay contiguity and decode each output.
 * 5. Filter delivery by frontend and return the publication tip.
 */
export const getCommands = Effect.fn('UserVersionedAggregateChain.getCommands')(
  function* (props: {
    db: IDb;
    afterUserIndex: number;
    frontend?: { name: string; lock: typeof AggregateFrontendLockSchema.Type };
    reconcile?: {
      commandIds: readonly string[];
      frontendName: string;
      throughUserIndex: number;
    };
  }) {
    // 1 — require a nonnegative safe afterUserIndex
    if (
      !Number.isSafeInteger(props.afterUserIndex) ||
      props.afterUserIndex < 0 ||
      (props.reconcile !== undefined &&
        (!Number.isSafeInteger(props.reconcile.throughUserIndex) ||
          props.reconcile.throughUserIndex < 0))
    ) {
      return yield* new ZerospinError({
        code: 'frontend-replay-cursor-invalid',
        message: 'Replay requires a nonnegative frontend cursor',
      });
    }

    // 2 — read the versioned frontend deltas table

    // 3 — select 64 replay positions, or requested IDs through the snapshot cursor
    const rows = props.db
      .select()
      .from(userVersionedAggregateChainDbConfig.schema.deltas)
      .where(
        and(
          gt(
            userVersionedAggregateChainDbConfig.schema.deltas.userIndex,
            props.afterUserIndex,
          ),
          props.reconcile === undefined
            ? undefined
            : inArray(
                userVersionedAggregateChainDbConfig.schema.deltas.commandId,
                [...props.reconcile.commandIds],
              ),
          props.reconcile === undefined
            ? undefined
            : lte(
                userVersionedAggregateChainDbConfig.schema.deltas.userIndex,
                props.reconcile.throughUserIndex,
              ),
        ),
      )
      .orderBy(asc(userVersionedAggregateChainDbConfig.schema.deltas.userIndex))
      .limit(
        props.reconcile === undefined
          ? 64
          : Math.max(1, props.reconcile.commandIds.length),
      )
      .all();

    // 4 — reject skipped indices or malformed retained output bytes
    const commands = yield* Effect.forEach(rows, (row, i) =>
      Effect.gen(function* () {
        if (
          props.reconcile === undefined &&
          row.userIndex !== props.afterUserIndex + i + 1
        ) {
          return yield* new ZerospinError({
            code: 'frontend-replay-gap',
            message: 'Frontend replay has a gap',
          });
        }
        return yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(AggregateFrontendFinalizedCommandSchema),
        )(row.output).pipe(
          mapParseError({
            code: 'frontend-replay-invalid',
            prefix: 'Invalid retained output',
          }),
        );
      }),
    );

    // 5 — read the whole-log maximum independently of the returned page
    return {
      commands: commands
        .filter(
          command =>
            props.reconcile === undefined ||
            command.resolution?.command.frontendName ===
              props.reconcile.frontendName,
        )
        .map(command => {
          if (props.frontend === undefined) return command;
          const { name, lock } = props.frontend;
          return {
            ...command,
            delta: {
              ...command.delta,
              inserted: command.delta.inserted.filter(resource =>
                Object.hasOwn(lock.models, resource.modelName),
              ),
              updated: command.delta.updated.filter(resource =>
                Object.hasOwn(lock.models, resource.modelName),
              ),
              deleted: command.delta.deleted.filter(resource =>
                Object.hasOwn(lock.models, resource.modelName),
              ),
              mutations: command.delta.mutations.filter(mutation =>
                Object.hasOwn(lock.models, mutation.modelName),
              ),
            },
            resolution:
              command.resolution?.command.frontendName === name
                ? command.resolution
                : null,
          };
        }),
      tip:
        props.db
          .select({
            index: userVersionedAggregateChainDbConfig.schema.deltas.userIndex,
          })
          .from(userVersionedAggregateChainDbConfig.schema.deltas)
          .orderBy(
            desc(userVersionedAggregateChainDbConfig.schema.deltas.userIndex),
          )
          .limit(1)
          .get()?.index ?? 0,
    };
  },
);
