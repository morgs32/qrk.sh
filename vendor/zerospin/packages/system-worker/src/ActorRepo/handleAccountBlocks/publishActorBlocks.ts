/*
 * System-worker annotation:
 * Publishes pure applied actor blocks to ActorBlockRepo and returns the outbox
 * records with any final publish failure.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import type { IAnyError } from '@zerospin/error';
import { Effect, Either, Schedule } from 'effect';

import { getActorBlockRepo } from '../../ActorBlockRepo/getActorBlockRepo/getActorBlockRepo.js';
import type { IActorBlock, IActorBlockOutboxRecord } from '../../types.js';

export const publishActorBlocks = Effect.fn('ActorRepo.publishActorBlocks')(
  function* (props: {
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
      actorId: string;
      actorName: string;
    };
    records: readonly IActorBlockOutboxRecord[];
  }): Effect.fn.Return<readonly IActorBlockOutboxRecord[], IAnyError, Async> {
    const { key, records } = props;
    const actorBlockRepo = yield* getActorBlockRepo({
      key,
    });
    const blocks = records.map(
      record =>
        ({
          pushedBlockId: record.pushedBlockId,
          lastAccountCursor: record.lastAccountCursor,
          accountIndex: record.accountIndex,
          executedCommands: record.executedCommands,
          failedCommands: record.failedCommands,
          appliedMutations: record.appliedMutations,
          deltas: record.deltas,
        }) satisfies IActorBlock,
    );
    const published = yield* makeAsync(() =>
      actorBlockRepo.storeActorBlocks({ blocks }),
    ).pipe(
      Effect.flatMap(decodeRpc),
      Effect.retry({
        times: 3,
        schedule: Schedule.exponential(250, 2),
      }),
      Effect.either,
    );

    if (Either.isRight(published)) {
      return records;
    }

    return records.map(record => ({
      ...record,
      failure: published.left,
    }));
  },
);
