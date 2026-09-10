import { makeAsync } from '@zerospin/core/async/makeAsync';
import { AggregateExecutionEntrySchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { VersionedAggregateChain } from '../../VersionedAggregateChain/VersionedAggregateChain.js';
import { versionedAggregateRepoDbConfig } from '../versionedAggregateRepoDbConfig.js';
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
export const execute = Effect.fn('VersionedAggregateRepo.execute')(
  function* (props: {
    aggregateIndex: number;
    db: IDb;
    subscriber: {
      catchup(index?: number): Promise<IEncodedResult<void, IAnyErrorJson>>;
    };
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
    };
  }) {
    const { db, key } = props;

    // 1 — require a positive safe aggregateIndex before resolving any owner
    if (
      !Number.isSafeInteger(props.aggregateIndex) ||
      props.aggregateIndex < 1
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-execution-index-invalid',
        message: 'Execution requires a positive aggregate index',
      });
    }

    // 2 — pull bounded pages through the same receiver used by live fanout
    yield* makeAsync(() => props.subscriber.catchup(props.aggregateIndex)).pipe(
      Effect.flatMap(decodeRpc),
    );

    // 3 — decode the exact aggregateIndex already committed by this version
    const pending = db
      .select()
      .from(versionedAggregateRepoDbConfig.schema.executedCommands)
      .where(
        eq(
          versionedAggregateRepoDbConfig.schema.executedCommands.outboxIndex,
          props.aggregateIndex,
        ),
      )
      .get();
    if (pending !== undefined) {
      return (yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(AggregateExecutionEntrySchema),
      )(pending.entry).pipe(
        mapParseError({
          code: 'aggregate-result-invalid',
          prefix: 'Invalid pending result',
        }),
      )).command;
    }
    // Read the outbox before remote history: deletion means VAC already acknowledged this exact result.

    // 4 — read VAC at the exact requested index and reject missing committed history
    const finalized = yield* VersionedAggregateChain.getRepo({ key });
    const queue = yield* makeAsync(() => finalized.replicaFanoutQueue);
    const page = yield* makeAsync(() =>
      queue.getPage({
        afterIndex: props.aggregateIndex - 1,
        maxIndex: props.aggregateIndex,
      }),
    ).pipe(Effect.flatMap(decodeRpc));
    const row = page.rows[0];
    if (row === undefined || row.outboxIndex !== props.aggregateIndex) {
      return yield* new ZerospinError({
        code: 'aggregate-committed-result-missing',
        message:
          'Committed result is missing from both outbox and finalized history',
      });
    }
    return (yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(AggregateExecutionEntrySchema),
    )(row.entry).pipe(
      mapParseError({
        code: 'aggregate-result-invalid',
        prefix: 'Invalid finalized result',
      }),
    )).command;
  },
);
