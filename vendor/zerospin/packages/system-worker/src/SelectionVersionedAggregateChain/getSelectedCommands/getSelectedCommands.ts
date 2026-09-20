import type { IDb } from '@zerospin/core/drizzle/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { AggregateSelectedCommandSchema } from '@zerospin/core/session/AggregateSelectedCommandSchema';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { and, asc, desc, gt, inArray, lte } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { selectionVersionedAggregateChainDbConfig } from '../selectionVersionedAggregateChainDbConfig.js';
/*
 * Frontend reconnects and snapshot publication checks read the retained SelectionVAC
 * log. Replay returns a contiguous page; snapshot reconciliation selects only
 * requested command IDs through the captured cursor. Both return the current tip.
 *
 * 1. Validate the replay cursor.
 * 2. Select retained selection output.
 * 3. Read a replay page or indexed reconciliation results.
 * 4. Check replay contiguity and decode each output.
 * 5. Filter delivery by frontend and return the publication tip.
 */
export const getSelectedCommands = Effect.fn(
  'SelectionVersionedAggregateChain.getSelectedCommands',
)(function* (props: {
  db: IDb;
  afterSelectionIndex: number;
  frontend?: {
    name: string;
    authentication: Readonly<Record<string, unknown>>;
    lock: typeof AggregateFrontendLockSchema.Type;
  };
  reconcile?: {
    commandIds: readonly string[];
    frontendName: string;
    authentication: Readonly<Record<string, unknown>>;
    throughSelectionIndex: number;
  };
}) {
  // 1 — require a nonnegative safe afterSelectionIndex
  if (
    !Number.isSafeInteger(props.afterSelectionIndex) ||
    props.afterSelectionIndex < 0 ||
    (props.reconcile !== undefined &&
      (!Number.isSafeInteger(props.reconcile.throughSelectionIndex) ||
        props.reconcile.throughSelectionIndex < 0))
  ) {
    return yield* new ZerospinError({
      code: 'frontend-replay-cursor-invalid',
      message: 'Replay requires a nonnegative frontend cursor',
    });
  }

  // 2 — read the retained selected-command table

  // 3 — select 64 replay positions, or requested IDs through the snapshot cursor
  const rows = props.db
    .select()
    .from(selectionVersionedAggregateChainDbConfig.schema.commands)
    .where(
      and(
        gt(
          selectionVersionedAggregateChainDbConfig.schema.commands.selectionIndex,
          props.afterSelectionIndex,
        ),
        props.reconcile === undefined
          ? undefined
          : inArray(
              selectionVersionedAggregateChainDbConfig.schema.commands.commandId,
              [...props.reconcile.commandIds],
            ),
        props.reconcile === undefined
          ? undefined
          : lte(
              selectionVersionedAggregateChainDbConfig.schema.commands.selectionIndex,
              props.reconcile.throughSelectionIndex,
            ),
      ),
    )
    .orderBy(
      asc(selectionVersionedAggregateChainDbConfig.schema.commands.selectionIndex),
    )
    .limit(
      props.reconcile === undefined
        ? 64
        : Math.max(1, props.reconcile.commandIds.length),
    )
    .all();

  // 4 — reject skipped indices or malformed retained output bytes
  const retained = yield* Effect.forEach(rows, (row, i) =>
    Effect.gen(function* () {
      if (
        props.reconcile === undefined &&
        row.selectionIndex !== props.afterSelectionIndex + i + 1
      ) {
        return yield* new ZerospinError({
          code: 'frontend-replay-gap',
          message: 'Frontend replay has a gap',
        });
      }
      const command = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(AggregateSelectedCommandSchema),
      )(row.output).pipe(
        mapParseError({
          code: 'frontend-replay-invalid',
          prefix: 'Invalid retained output',
        }),
      );
      const authentication = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(
          Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
        ),
      )(row.authentication).pipe(
        mapParseError({
          code: 'frontend-replay-invalid',
          prefix: 'Invalid retained completion owner',
        }),
      );
      return { authentication, command, row };
    }),
  );

  // 5 — read the whole-log maximum independently of the returned page
  return {
    commands: retained
      .filter(
        ({ authentication, row }) =>
          props.reconcile === undefined ||
          (row.frontendName === props.reconcile.frontendName &&
            isEqual(authentication, props.reconcile.authentication)),
      )
      .map(({ authentication, command, row }) => {
        const ownsCompletion =
          props.frontend !== undefined &&
          row.frontendName === props.frontend.name &&
          isEqual(authentication, props.frontend.authentication);
        if (props.frontend === undefined) {
          return {
            ...command,
            failure:
              props.reconcile !== undefined &&
              row.frontendName === props.reconcile.frontendName &&
              isEqual(authentication, props.reconcile.authentication)
                ? command.failure
                : null,
          };
        }
        const { lock } = props.frontend;
        return {
          ...command,
          delta: {
            upserted: command.delta.upserted.filter(resource =>
              Object.hasOwn(lock.models, resource.modelName),
            ),
            deleted: command.delta.deleted.filter(resource =>
              Object.hasOwn(lock.models, resource.modelName),
            ),
          },
          failure: ownsCompletion ? command.failure : null,
        };
      }),
    tip:
      props.db
        .select({
          index:
            selectionVersionedAggregateChainDbConfig.schema.commands.selectionIndex,
        })
        .from(selectionVersionedAggregateChainDbConfig.schema.commands)
        .orderBy(
          desc(
            selectionVersionedAggregateChainDbConfig.schema.commands.selectionIndex,
          ),
        )
        .limit(1)
        .get()?.index ?? 0,
  };
});
