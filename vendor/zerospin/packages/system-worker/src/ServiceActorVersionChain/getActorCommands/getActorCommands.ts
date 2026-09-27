import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceActorCommandSchema } from '@zerospin/core/serviceSession/ServiceActorCommandSchema';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { asc, desc, gt } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { serviceActorVersionChainDbConfig } from '../serviceActorVersionChainDbConfig.js';
/*
 * Session reconnects and snapshot publication checks read the retained FSC
 * log. This reader returns a bounded, validated contiguous suffix plus the
 * current publication tip.
 *
 * 1. Validate the replay cursor.
 * 2. Select retained definition output.
 * 3. Read the next replay page.
 * 4. Check contiguity and decode each output.
 * 5. Return commands and the publication tip.
 */
export const getActorCommands = Effect.fn(
  'ServiceActorVersionChain.getActorCommands',
)(function* (props: { db: IDb; afterServiceIndex: number }) {
  // 1 — require a nonnegative safe afterServiceIndex
  if (
    !Number.isSafeInteger(props.afterServiceIndex) ||
    props.afterServiceIndex < 0
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'session-replay-cursor-invalid',
        message: 'Replay requires a nonnegative service cursor',
      }),
    );
  }

  // 2 — read the retained actor-command table

  // 3 — select at most 64 ascending positions after the cursor
  const rows = props.db
    .select()
    .from(serviceActorVersionChainDbConfig.schema.commands)
    .where(
      gt(
        serviceActorVersionChainDbConfig.schema.commands.actorServiceIndex,
        props.afterServiceIndex,
      ),
    )
    .orderBy(
      asc(serviceActorVersionChainDbConfig.schema.commands.actorServiceIndex),
    )
    .limit(64)
    .all();

  // 4 — reject skipped indices or malformed retained output bytes
  const commands = yield* Effect.forEach(rows, (row, i) =>
    Effect.gen(function* () {
      if (row.actorServiceIndex !== props.afterServiceIndex + i + 1) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'session-replay-gap',
            message: 'Session replay has a gap',
          }),
        );
      }
      const decoded = yield* serviceActorVersionChainDbConfig.tables.commands
        .decodeRow(row)
        .pipe(
          mapParseError({
            code: 'session-replay-invalid',
            prefix: 'Invalid retained output',
          }),
        );
      if (
        decoded.actorServiceIndex === null ||
        decoded.serviceHash === null ||
        decoded.actorDelta === null
      ) {
        return yield* makeZerospinError('session-replay-invalid');
      }
      return yield* Schema.decodeUnknownEffect(
        Schema.toType(ServiceActorCommandSchema),
      )({
        id: decoded.id,
        serviceIndex: decoded.actorServiceIndex,
        actorDelta: decoded.actorDelta,
        serviceHash: decoded.serviceHash,
      }).pipe(
        mapParseError({
          code: 'session-replay-invalid',
          prefix: 'Invalid retained output',
        }),
      );
    }),
  );

  // 5 — read the whole-log maximum independently of the returned page
  return {
    commands,
    tip:
      props.db
        .select({
          index:
            serviceActorVersionChainDbConfig.schema.commands.actorServiceIndex,
        })
        .from(serviceActorVersionChainDbConfig.schema.commands)
        .orderBy(
          desc(
            serviceActorVersionChainDbConfig.schema.commands.actorServiceIndex,
          ),
        )
        .limit(1)
        .get()?.index ?? 0,
  };
});
