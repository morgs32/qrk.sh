import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeAbbreviationIdSchema, makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import type { IDrizzleRelationsFromModels } from '../drizzle/types.ts';
import type {
  IAggregateFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { AggregateFrontendFinalizedCommandSchema } from './AggregateFrontendCommandSchema.ts';
import {
  applyAggregateFrontendCommandTx,
  Db,
} from './applyAggregateFrontendCommandTx.ts';
import type {
  IAggregateFrontendFinalizedCommand,
  IAggregateFrontendSyncState,
  ISessionDrizzleDb,
  ISessionId,
} from './types.ts';

/*
 * 1. Validate the command kind, bound target, and terminal status.
 * 2. Encode canonical journal bytes and validate every delta resource.
 * 3. Enforce duplicate and contiguous frontier rules in one transaction.
 * 4. Rewind active optimism before authoritative or failed input.
 * 5. Apply finalized state or record the next pushed occurrence.
 * 6. Replay surviving optimistic mutations over the new base.
 * 7. Advance only the frontiers owned by this command kind.
 * 8. Report the committed application result.
 */
export const applyAggregateFrontendCommand = Effect.fn(
  'applyAggregateFrontendCommand',
)(function* <FRONTEND extends IAggregateFrontendController>(props: {
  db: ISessionDrizzleDb<
    InferFrontendModels<FRONTEND>,
    IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
  >;
  frontend: FRONTEND;
  models: InferFrontendModels<FRONTEND>;
  command: IAggregateFrontendFinalizedCommand;
  aggregateId: IAggregateFrontendSyncState['aggregateId'];
  userId: IAggregateFrontendSyncState['userId'];
  sessionId: ISessionId;
}): Effect.fn.Return<'applied' | 'duplicate', IAnyError> {
  // 1 — Encode against the finalized or pushed wire schema, then reject a
  // foreign target or any occurrence whose delta is still pending.
  const { aggregateId, command, db, frontend, models, sessionId, userId } =
    props;

  yield* Schema.encodeUnknownEffect(AggregateFrontendFinalizedCommandSchema)(
    command,
  ).pipe(
    mapParseError({
      code: 'aggregate-frontend-command-invalid',
      prefix: 'Invalid frontend output',
    }),
  );
  const resolution = command.resolution?.command ?? null;
  if (
    resolution !== null &&
    (resolution.aggregateId !== aggregateId ||
      resolution.aggregateName !== frontend.aggregateName ||
      resolution.userId !== userId ||
      resolution.frontendName !== frontend.name ||
      resolution.aggregateIndex !== command.aggregateIndex ||
      resolution.dispositionHash === null)
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-resolution-invalid',
      message: 'Resolution does not match the bound view and command position',
    });
  }
  const delta = command.delta;
  // 2 — Preserve the complete occurrence as canonical journal JSON and decode
  // every inserted, updated, and deleted resource against its frontend model.
  const resourceRows = [...delta.inserted, ...delta.updated];
  for (const resource of resourceRows) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: resource.modelName,
      recordKind: 'frontend models',
    });
    yield* Schema.decodeUnknownEffect(makeEffectSchema(model.propertiesShape))(
      resource,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'aggregate-frontend-command-resource-invalid',
        prefix: `Failed to decode frontend resource ${resource.modelName}.${resource.id}`,
      }),
    );
  }
  for (const removedRef of delta.deleted) {
    const model = yield* getByKeyOrThrow({
      record: models,
      key: removedRef.modelName,
      recordKind: 'frontend models',
    });
    yield* Schema.decodeUnknownEffect(
      Schema.toType(
        Schema.Struct({
          id: makeAbbreviationIdSchema(model.abbreviation),
          modelName: Schema.Literal(model.modelName),
        }),
      ),
    )(removedRef, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-frontend-command-ref-invalid',
        prefix: `Failed to decode deleted frontend ref ${removedRef.modelName}.${removedRef.id}`,
      }),
    );
  }

  return yield* applyAggregateFrontendCommandTx({
    sessionId,
    command,
    models,
    resourceRows,
    delta,
    resolution,
  }).pipe(Effect.provideService(Db, db));
});
