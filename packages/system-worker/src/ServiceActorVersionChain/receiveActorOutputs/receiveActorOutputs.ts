import type { ServiceCallerSchema } from '@zerospin/core/contracts/ServiceCallerSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import type { IServiceActorOutput } from '@zerospin/core/serviceSession/types';
import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
} from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { isEqual } from 'es-toolkit';

import { decodeActorOutput } from '../decodeActorOutput.js';
import { serviceActorVersionChainDbConfig } from '../serviceActorVersionChainDbConfig.js';

/** Retain one selected local execution before broadcasting it. */
const retainActorOutput = makeTx('ServiceActorVersionChain.retainActorOutput')(
  function* (
    tx: ITx<typeof serviceActorVersionChainDbConfig>,
    row: typeof serviceActorVersionChainDbConfig.schema.browserCommands.$inferSelect,
  ) {
    const { browserCommands: outputs } =
      serviceActorVersionChainDbConfig.schema;
    const existing = tx
      .select()
      .from(outputs)
      .where(eq(outputs.executedIndex, row.executedIndex))
      .get();
    if (existing !== undefined) {
      if (!isEqual(existing, row)) {
        return yield* makeZerospinError('session-output-identity-mismatch');
      }
      return;
    }
    const tip =
      tx
        .select({ index: outputs.executedIndex })
        .from(outputs)
        .orderBy(desc(outputs.executedIndex))
        .limit(1)
        .get()?.index ?? 0;
    if (row.executedIndex !== tip + 1) {
      return yield* makeZerospinError({
        code: 'session-output-index-gap',
        message: `Expected output ${tip + 1}, received ${row.executedIndex}`,
      });
    }
    tx.insert(outputs).values(row).run();
  },
);

export const receiveActorOutputs = Effect.fn(
  'ServiceActorVersionChain.receiveActorOutputs',
)(function* (props: {
  rows: readonly (typeof serviceActorVersionChainDbConfig.schema.browserCommands.$inferSelect)[];
  db: IDb<typeof serviceActorVersionChainDbConfig>;
  broadcast(
    output: IServiceActorOutput,
    owner: typeof ServiceCallerSchema.Type | null,
  ): void;
}) {
  for (const row of props.rows) {
    const output = yield* decodeActorOutput(row);
    yield* retainActorOutput(props.db, row).pipe(
      Effect.mapError(cause =>
        isZerospinError(cause) && cause.code !== 'drizzle-transaction-failed'
          ? cause
          : makeZerospinError({
              code: 'session-output-commit-failed',
              message: 'Failed to persist actor output',
              cause: prettyUnknownFailure(cause),
            }),
      ),
    );
    const decoded =
      yield* serviceActorVersionChainDbConfig.tables.browserCommands
        .decodeRow(row)
        .pipe(
          mapParseError({
            code: 'session-output-invalid',
            prefix: 'Invalid retained output',
          }),
        );
    props.broadcast(output, decoded.caller);
  }
});
