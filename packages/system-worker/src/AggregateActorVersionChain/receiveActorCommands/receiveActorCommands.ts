import { AggregateActorCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import type { IAggregateActorCommand } from '@zerospin/core/aggregateSession/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
} from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { aggregateActorVersionChainDbConfig } from '../aggregateActorVersionChainDbConfig.js';
import { projectActorCommand } from '../projectActorCommand.js';

const claimsSchema = makeEffectSchema(
  aggregateActorVersionChainDbConfig.tables.commands.shape,
).fields.completionClaims;

/** Retain a validated actor command before broadcasting, including on duplicate delivery. */
const retainActorCommand = makeTx(
  'AggregateActorVersionChain.retainActorCommand',
)(function* (
  tx: ITx<typeof aggregateActorVersionChainDbConfig>,
  row: typeof aggregateActorVersionChainDbConfig.schema.commands.$inferSelect,
  output: IAggregateActorCommand,
  claims: Readonly<Record<string, unknown>> | null,
) {
  if (
    (claims === null) !== (row.completionSessionName === null) ||
    (claims === null) !== (row.completionNodeId === null) ||
    (claims === null) !== (row.completionNodeIndex === null) ||
    ((output.admission !== null || output.execution !== null) &&
      claims === null)
  ) {
    return yield* makeZerospinError({
      code: 'session-output-completion-owner-invalid',
      message: 'Actor command has invalid completion ownership',
    });
  }
  const { commands } = aggregateActorVersionChainDbConfig.schema;
  if (row.executedIndex === null) {
    return yield* makeZerospinError('session-output-incomplete');
  }
  const existing = tx
    .select()
    .from(commands)
    .where(eq(commands.executedIndex, row.executedIndex))
    .get();
  if (existing !== undefined) {
    if (!isEqual(existing, row)) {
      return yield* makeZerospinError('session-output-identity-mismatch');
    }
    return;
  }

  const previous = tx
    .select({
      executedIndex: commands.executedIndex,
      aggregateIndex: commands.actorAggregateIndex,
    })
    .from(commands)
    .orderBy(desc(commands.executedIndex))
    .limit(1)
    .get();
  const tip = previous?.executedIndex ?? 0;
  if (row.executedIndex !== tip + 1) {
    return yield* makeZerospinError({
      code: 'session-output-index-gap',
      message: `Expected output ${tip + 1}, received ${row.executedIndex}`,
    });
  }
  if (output.aggregateIndex < (previous?.aggregateIndex ?? 0)) {
    return yield* makeZerospinError({
      code: 'session-output-watermark-regression',
      message: 'Output regresses the consumed aggregate position',
    });
  }

  tx.insert(commands).values(row).run();
});

export const receiveActorCommands = Effect.fn(
  'AggregateActorVersionChain.receiveActorCommands',
)(function* (props: {
  rows: readonly (typeof aggregateActorVersionChainDbConfig.schema.commands.$inferSelect)[];
  db: IDb<typeof aggregateActorVersionChainDbConfig>;
  broadcast(props: {
    command: IAggregateActorCommand;
    claims: Readonly<Record<string, unknown>> | null;
    sessionName: string | null;
  }): void;
}) {
  for (const row of props.rows) {
    const decoded = yield* aggregateActorVersionChainDbConfig.tables.commands
      .decodeRow(row)
      .pipe(
        Effect.catch(error =>
          // Classify malformed authentication only after a row fails decoding.
          Schema.decodeUnknownEffect(claimsSchema)(row.completionClaims).pipe(
            mapParseError({
              code: 'session-output-completion-owner-invalid',
              prefix: 'Failed to decode actor command owner',
            }),
            Effect.andThen(
              Effect.fail(error).pipe(
                mapParseError({
                  code: 'session-output-invalid',
                  prefix: 'Failed to decode replica output',
                }),
              ),
            ),
          ),
        ),
      );
    const output = yield* Schema.decodeUnknownEffect(
      Schema.toType(AggregateActorCommandSchema),
    )(projectActorCommand(decoded)).pipe(
      mapParseError({
        code: 'session-output-invalid',
        prefix: 'Failed to decode replica output',
      }),
    );
    yield* retainActorCommand(
      props.db,
      row,
      output,
      decoded.completionClaims,
    ).pipe(
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
    props.broadcast({
      command: output,
      claims: decoded.completionClaims,
      sessionName: decoded.completionSessionName,
    });
  }
});
