import { makeAsync } from '@zerospin/core/async/makeAsync';
import { AggregateExecutionEntrySchema } from '@zerospin/core/contracts/CommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { genesisDispositionHash } from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import { VersionedAggregateChain } from '../../VersionedAggregateChain/VersionedAggregateChain.js';
import type { VersionedAggregateRepo } from '../VersionedAggregateRepo.js';
/** Complete execution and durable VAC publication through one fixed checkpoint. */
/*
 * Cutover asks a version-owned aggregate materializer to execute and durably
 * publish one fixed checkpoint. The returned identity and disposition hash come
 * from retained VAC history after executedCommands-outbox acknowledgement.
 *
 * 1. Validate the checkpoint.
 * 2. Return the empty-history checkpoint.
 * 3. Execute through the checkpoint.
 * 4. Wait for bounded durable publication.
 * 5. Read the retained checkpoint from VAC.
 * 6. Reject missing published history.
 * 7. Decode and return checkpoint identity.
 */
export const flush = Effect.fn('VersionedAggregateRepo.flush')(
  function* (props: {
    aggregateIndex: number;
    repo: Pick<VersionedAggregateRepo, 'execute'>;
    executedCommands: VersionedAggregateRepo['executedCommands'];
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
    };
  }) {
    // 1 — require a nonnegative safe aggregateIndex
    if (
      !Number.isSafeInteger(props.aggregateIndex) ||
      props.aggregateIndex < 0
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-flush-index-invalid',
        message: 'Flush requires a nonnegative index',
      });
    }

    // 2 — use a null commandId and genesis disposition hash at zero
    if (props.aggregateIndex === 0) {
      return {
        aggregateIndex: 0,
        commandId: null,
        dispositionHash: genesisDispositionHash(),
      };
    }

    // 3 — await repo.execute before draining its executedCommands outbox
    yield* makeAsync(() =>
      props.repo.execute({ aggregateIndex: props.aggregateIndex }),
    ).pipe(Effect.flatMap(decodeRpc));

    // 4 — drain executedCommands only through the requested aggregateIndex
    yield* props.executedCommands.drain(props.aggregateIndex);

    // 5 — request exactly the position that was flushed
    const chain = yield* VersionedAggregateChain.getRepo({
      key: props.key,
    });
    const queue = yield* makeAsync(() => chain.replicaFanoutQueue);
    const page = yield* makeAsync(() =>
      queue.getPage({
        afterIndex: props.aggregateIndex - 1,
        maxIndex: props.aggregateIndex,
      }),
    ).pipe(Effect.flatMap(decodeRpc));
    const row = page.rows[0];

    // 6 — require the returned outboxIndex to equal the requested checkpoint
    if (row === undefined || row.outboxIndex !== props.aggregateIndex) {
      return yield* new ZerospinError({
        code: 'aggregate-flush-publication-missing',
        message: 'Flush checkpoint has not been published',
      });
    }

    // 7 — return aggregateIndex, commandId, and dispositionHash from the retained entry
    const { command } = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(AggregateExecutionEntrySchema),
    )(row.entry).pipe(
      mapParseError({
        code: 'aggregate-flush-result-invalid',
        prefix: 'Invalid flush checkpoint',
      }),
    );
    return {
      aggregateIndex: command.aggregateIndex,
      commandId: command.id,
      dispositionHash: command.dispositionHash,
    };
  },
);
