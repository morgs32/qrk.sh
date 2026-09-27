import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { ServiceActorCommandSchema } from '@zerospin/core/serviceSession/ServiceActorCommandSchema';
import type { IServiceActorCommand } from '@zerospin/core/serviceSession/types';
import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
} from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { serviceActorVersionChainDbConfig } from '../serviceActorVersionChainDbConfig.js';

/** Retain a validated actor command before broadcasting, including on duplicate delivery. */
const retainActorCommand = makeTx(
  'ServiceActorVersionChain.retainActorCommand',
)(function* (
  tx: ITx<typeof serviceActorVersionChainDbConfig>,
  row: typeof serviceActorVersionChainDbConfig.schema.commands.$inferSelect,
) {
  const { commands } = serviceActorVersionChainDbConfig.schema;
  if (row.actorServiceIndex === null) {
    return yield* makeZerospinError('session-output-incomplete');
  }
  const existing = tx
    .select()
    .from(commands)
    .where(eq(commands.actorServiceIndex, row.actorServiceIndex))
    .get();
  if (existing !== undefined) {
    if (!isEqual(existing, row)) {
      return yield* makeZerospinError('session-output-identity-mismatch');
    }
    return;
  }

  const tip =
    tx
      .select({ index: commands.actorServiceIndex })
      .from(commands)
      .orderBy(desc(commands.actorServiceIndex))
      .limit(1)
      .get()?.index ?? 0;
  if (row.actorServiceIndex !== tip + 1) {
    return yield* makeZerospinError({
      code: 'session-output-index-gap',
      message: `Expected output ${tip + 1}, received ${row.actorServiceIndex}`,
    });
  }

  tx.insert(commands).values(row).run();
});

export const receiveActorCommands = Effect.fn(
  'ServiceActorVersionChain.receiveActorCommands',
)(function* (props: {
  rows: readonly (typeof serviceActorVersionChainDbConfig.schema.commands.$inferSelect)[];
  db: IDb<typeof serviceActorVersionChainDbConfig>;
  broadcast(output: IServiceActorCommand): void;
}) {
  for (const row of props.rows) {
    const decoded = yield* serviceActorVersionChainDbConfig.tables.commands
      .decodeRow(row)
      .pipe(
        mapParseError({
          code: 'session-output-invalid',
          prefix: 'Failed to decode replica output',
        }),
      );
    if (
      decoded.actorServiceIndex === null ||
      decoded.serviceHash === null ||
      decoded.actorDelta === null
    ) {
      return yield* makeZerospinError('session-output-incomplete');
    }
    const output = yield* Schema.decodeUnknownEffect(
      Schema.toType(ServiceActorCommandSchema),
    )({
      id: decoded.id,
      serviceIndex: decoded.actorServiceIndex,
      actorDelta: decoded.actorDelta,
      serviceHash: decoded.serviceHash,
    }).pipe(
      mapParseError({
        code: 'session-output-invalid',
        prefix: 'Failed to decode replica output',
      }),
    );
    yield* retainActorCommand(props.db, row).pipe(
      Effect.mapError(cause =>
        isZerospinError(cause) && cause.code !== 'drizzle-transaction-failed'
          ? cause
          : makeZerospinError({
              code: 'session-output-commit-failed',
              message: 'Failed to persist replica output',
              cause: prettyUnknownFailure(cause),
            }),
      ),
    );
    props.broadcast(output);
  }
});
