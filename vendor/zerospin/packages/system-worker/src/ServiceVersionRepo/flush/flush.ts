import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { ServiceExecutedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { genesisDispositionHash } from '../../serviceDispositionHash/serviceDispositionHash.js';
import { ServiceVersionChain } from '../../ServiceVersionChain/ServiceVersionChain.js';
import { serviceVersionChainDbConfig } from '../../ServiceVersionChain/serviceVersionChainDbConfig.js';
import type { ServiceVersionRepo } from '../ServiceVersionRepo.js';
/** Complete execution and durable VSC publication through one fixed checkpoint. */
/*
 * Cutover asks a version-owned service materializer to execute and durably
 * publish one fixed checkpoint. The returned identity and disposition hash come
 * from retained VSC history after results-outbox acknowledgement.
 *
 * 1. Validate the checkpoint.
 * 2. Return the empty-history checkpoint.
 * 3. Execute through the checkpoint.
 * 4. Wait for bounded durable publication.
 * 5. Read the retained checkpoint from VSC.
 * 6. Reject missing published history.
 * 7. Decode and return checkpoint identity.
 */
export const flush = Effect.fn('ServiceVersionRepo.flush')(function* (props: {
  serviceIndex: number;
  repo: Pick<ServiceVersionRepo, 'execute'>;
  executionResultsOutbox: ServiceVersionRepo['executionResultsOutbox'];
  key: {
    systemId: string;
    serviceName: string;
    serviceVersion: string;
  };
}) {
  // 1 — require a nonnegative safe serviceIndex
  if (!Number.isSafeInteger(props.serviceIndex) || props.serviceIndex < 0) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-flush-index-invalid',
        message: 'Flush requires a nonnegative index',
      }),
    );
  }

  // 2 — use a null commandId and genesis disposition hash at zero
  if (props.serviceIndex === 0) {
    return {
      serviceIndex: 0,
      commandId: null,
      dispositionHash: genesisDispositionHash(),
    };
  }

  // 3 — await repo.execute before draining its results outbox
  yield* makeAsync(() =>
    props.repo.execute({ serviceIndex: props.serviceIndex }),
  ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));

  // 4 — drain results only through the requested serviceIndex
  yield* props.executionResultsOutbox.drain(props.serviceIndex);

  // 5 — request exactly the position that was flushed
  const chain = yield* ServiceVersionChain.getRepo({
    key: props.key,
  });
  const queue = yield* makeAsync(() => chain.executionResultsFanout);
  const page = yield* makeAsync(() =>
    queue.getPage({
      afterIndex: props.serviceIndex - 1,
      maxIndex: props.serviceIndex,
    }),
  ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
  const row = page.rows[0];

  // 6 — require the returned serviceIndex to equal the requested checkpoint
  if (row === undefined || row.serviceIndex !== props.serviceIndex) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-flush-publication-missing',
        message: 'Flush checkpoint has not been published',
      }),
    );
  }

  // 7 — return serviceIndex, commandId, and dispositionHash from the retained executedCommand
  const command = yield* serviceVersionChainDbConfig.tables.commands
    .decodeRow(row)
    .pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.toType(ServiceExecutedCommandSchema)),
      ),
    )
    .pipe(
      mapParseError({
        code: 'service-flush-result-invalid',
        prefix: 'Invalid flush checkpoint',
      }),
    );
  return {
    serviceIndex: command.serviceIndex,
    commandId: command.id,
    dispositionHash: command.dispositionHash,
  };
});
