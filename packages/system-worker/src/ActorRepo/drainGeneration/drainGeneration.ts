/*
 * Replays the retained ActorRepo outbox through ActorBlockRepo before a
 * generation freeze captures any downstream projection bounds.
 */

import type { Async } from '@zerospin/core/async/Async';
import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { asc, gt } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { ActorDeltaSchema } from '../../blockSchemas.js';
import type { IActorBlockOutboxRecord } from '../../types.js';
import { actorRepoDrizzleSchemas } from '../ActorRepo.js';
import { publishActorBlocks } from '../handleAccountBlocks/publishActorBlocks.js';
import { upsertActorBlockOutbox } from '../handleAccountBlocks/upsertActorBlockOutbox.js';

export const drainGeneration = Effect.fn('ActorRepo.drainGeneration')(
  function* (props: {
    db: IDb;
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
      actorId: string;
      actorName: string;
    };
    inspectionOnly: boolean;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    Readonly<{ pendingActorBlockCount: number }>,
    IAnyError,
    Async
  > {
    const { db, inspectionOnly, key, storage } = props;

    // A retained row with failure=null may be either acknowledged or the
    // result of a crash after its transaction committed but before publish.
    // The durable acknowledgement advances only after ActorBlockRepo accepts
    // an exact batch. Reading one extra row bounds every RPC while proving
    // whether another retry is required.
    let lastPublishedActorBlockAccountIndex = yield* Effect.promise(() =>
      storage.get<number>('lastPublishedActorBlockAccountIndex'),
    );
    let pendingActorBlockCount = 1;
    while (pendingActorBlockCount > 0) {
      const rawRecords =
        lastPublishedActorBlockAccountIndex === undefined
          ? db
              .select()
              .from(actorRepoDrizzleSchemas.actorBlockOutbox)
              .orderBy(
                asc(actorRepoDrizzleSchemas.actorBlockOutbox.accountIndex),
              )
              .limit(101)
              .all()
          : db
              .select()
              .from(actorRepoDrizzleSchemas.actorBlockOutbox)
              .where(
                gt(
                  actorRepoDrizzleSchemas.actorBlockOutbox.accountIndex,
                  lastPublishedActorBlockAccountIndex,
                ),
              )
              .orderBy(
                asc(actorRepoDrizzleSchemas.actorBlockOutbox.accountIndex),
              )
              .limit(101)
              .all();
      if (rawRecords.length === 0) {
        pendingActorBlockCount = 0;
        continue;
      }
      if (inspectionOnly) {
        return yield* new ZerospinError({
          code: 'actor-generation-self-hosted-drain-required',
          message:
            'ActorRepo has unacknowledged actor blocks that self-hosted generation control must not publish with newly uploaded code',
          extra: {
            pendingActorBlockCount: rawRecords.length,
            lastPublishedActorBlockAccountIndex:
              lastPublishedActorBlockAccountIndex ?? null,
          },
        });
      }

      const hasMoreRecords = rawRecords.length > 100;
      const rawBatch = rawRecords.slice(0, 100);

      const records: IActorBlockOutboxRecord[] = [];
      for (const rawRecord of rawBatch) {
        const executedCommands = yield* Schema.decodeUnknown(
          Schema.parseJson(
            Schema.Array(
              Schema.Union(
                EncodedExecutedAccountCommandSchema,
                ExecutedPushedCommandSchema,
              ),
            ),
          ),
        )(rawRecord.executedCommands).pipe(
          mapParseError({
            code: 'actor-repo-outbox-executed-commands-decode-failed',
            prefix:
              'Failed to decode executed commands from retained ActorRepo outbox row',
          }),
        );
        const failedCommands = yield* Schema.decodeUnknown(
          Schema.parseJson(
            Schema.Array(
              Schema.Union(
                EncodedFailedAccountCommandSchema,
                FailedPushedCommandSchema,
              ),
            ),
          ),
        )(rawRecord.failedCommands).pipe(
          mapParseError({
            code: 'actor-repo-outbox-failed-commands-decode-failed',
            prefix:
              'Failed to decode failed commands from retained ActorRepo outbox row',
          }),
        );
        const appliedMutations = yield* Schema.decodeUnknown(
          Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
        )(rawRecord.appliedMutations).pipe(
          mapParseError({
            code: 'actor-repo-outbox-applied-mutations-decode-failed',
            prefix:
              'Failed to decode applied mutations from retained ActorRepo outbox row',
          }),
        );
        const deltas = yield* Schema.decodeUnknown(
          Schema.parseJson(
            Schema.Record({
              key: Schema.String,
              value: ActorDeltaSchema,
            }),
          ),
        )(rawRecord.deltas).pipe(
          mapParseError({
            code: 'actor-repo-outbox-deltas-decode-failed',
            prefix:
              'Failed to decode deltas from retained ActorRepo outbox row',
          }),
        );
        const failure = yield* Schema.decodeUnknown(
          Schema.NullOr(Schema.parseJson(ZerospinError.schema)),
        )(rawRecord.failure).pipe(
          mapParseError({
            code: 'actor-repo-outbox-publish-failure-decode-failed',
            prefix:
              'Failed to decode publish failure from retained ActorRepo outbox row',
          }),
        );

        records.push({
          pushedBlockId: rawRecord.pushedBlockId,
          lastAccountCursor: rawRecord.lastAccountCursor,
          accountIndex: rawRecord.accountIndex,
          executedCommands,
          failedCommands,
          appliedMutations,
          deltas,
          failure,
        });
      }

      const publishedRecords = yield* publishActorBlocks({ key, records });
      let publishFailed = false;
      for (const record of publishedRecords) {
        yield* upsertActorBlockOutbox({ db, record });
        if (record.failure !== null) {
          publishFailed = true;
        }
      }

      if (publishFailed) {
        return {
          pendingActorBlockCount:
            publishedRecords.length + (hasMoreRecords ? 1 : 0),
        };
      }

      const lastPublishedRecord = publishedRecords[publishedRecords.length - 1];
      if (lastPublishedRecord !== undefined) {
        lastPublishedActorBlockAccountIndex = yield* Effect.promise(() =>
          storage.transaction(async transaction => {
            const currentAccountIndex = await transaction.get<number>(
              'lastPublishedActorBlockAccountIndex',
            );
            if (
              currentAccountIndex === undefined ||
              currentAccountIndex < lastPublishedRecord.accountIndex
            ) {
              await transaction.put(
                'lastPublishedActorBlockAccountIndex',
                lastPublishedRecord.accountIndex,
              );
              return lastPublishedRecord.accountIndex;
            }
            return currentAccountIndex;
          }),
        );
      }
      pendingActorBlockCount = hasMoreRecords ? 1 : 0;
    }

    return { pendingActorBlockCount: 0 };
  },
);
