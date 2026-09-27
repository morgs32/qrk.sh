import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { AggregateExecutedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  mapParseError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { AggregateVersionChain } from '../../AggregateVersionChain/AggregateVersionChain.js';
import { aggregateVersionChainDbConfig } from '../../AggregateVersionChain/aggregateVersionChainDbConfig.js';
import { aggregateVersionRepoDbConfig } from '../aggregateVersionRepoDbConfig.js';
/** Fetch outside SQLite transactions, serialize preparation/execution, and recover exact version-owned output. */
/*
 * Direct finalization fetches admitted pages through a fixed aggregate index.
 * executeCommands owns preparation and atomic state/result commits.
 * Retried requests recover exact terminal results from the outbox or VAC.
 *
 * 1. Validate the requested execution checkpoint.
 * 2. Catch up through the bound subscriber.
 * 3. Recover the requested result from the pending outbox.
 * 4. Recover published output after outbox deletion.
 */
export const execute = Effect.fn('AggregateVersionRepo.execute')(
  function* (props: {
    aggregateIndex: number;
    db: IDb;
    subscriber: {
      catchup(index?: number): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
    };
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
    };
  }) {
    const { db, key, aggregateIndex, subscriber } = props;

    // 1 — require a positive safe aggregateIndex before resolving any owner
    if (!Number.isSafeInteger(aggregateIndex) || aggregateIndex < 1) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'aggregate-execution-index-invalid',
          message: 'Execution requires a positive aggregate index',
        }),
      );
    }

    // 2 — pull bounded pages through the same receiver used by live fanout
    yield* makeAsync(() => subscriber.catchup(aggregateIndex)).pipe(
      Effect.flatMap(envelope => readRpcEnvelope(envelope)),
    );

    // 3 — decode the exact aggregateIndex already committed by this version
    const pending = db
      .select()
      .from(aggregateVersionRepoDbConfig.schema.aggregateCommands)
      .where(
        eq(
          aggregateVersionRepoDbConfig.schema.aggregateCommands.aggregateIndex,
          aggregateIndex,
        ),
      )
      .get();
    if (pending !== undefined) {
      const command =
        yield* aggregateVersionRepoDbConfig.tables.aggregateCommands
          .decodeRow(pending)
          .pipe(
            Effect.flatMap(
              Schema.decodeUnknownEffect(
                Schema.toType(AggregateExecutedCommandSchema),
              ),
            ),
          )
          .pipe(
            mapParseError({
              code: 'aggregate-result-invalid',
              prefix: 'Invalid pending result',
            }),
          );
      return { ...command, executedIndex: pending.executedIndex };
    }
    // Read the outbox before remote history: deletion means VAC already acknowledged this exact result.

    // 4 — read VAC at the exact requested index and reject missing committed history
    const finalized = yield* AggregateVersionChain.getRepo({ key });
    const row = yield* makeAsync<
      Awaited<ReturnType<AggregateVersionChain['getAggregateResult']>>
    >(() => finalized.getAggregateResult(aggregateIndex)).pipe(
      Effect.flatMap(readRpcEnvelope),
    );
    if (row === undefined || row.aggregateIndex !== aggregateIndex) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'aggregate-committed-result-missing',
          message:
            'Committed result is missing from both outbox and finalized history',
        }),
      );
    }
    const command =
      yield* aggregateVersionChainDbConfig.tables.aggregateCommands
        .decodeRow(row)
        .pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(
              Schema.toType(AggregateExecutedCommandSchema),
            ),
          ),
        )
        .pipe(
          mapParseError({
            code: 'aggregate-result-invalid',
            prefix: 'Invalid finalized result',
          }),
        );
    return { ...command, executedIndex: row.executedIndex };
  },
);
