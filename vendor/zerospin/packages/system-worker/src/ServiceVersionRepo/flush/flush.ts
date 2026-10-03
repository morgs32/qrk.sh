import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { ServiceTerminalCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { genesisDispositionHash } from '../../serviceDispositionHash/serviceDispositionHash.js';
import type { ServiceVersionChain } from '../../ServiceVersionChain/ServiceVersionChain.js';
import { serviceVersionChainDbConfig } from '../../ServiceVersionChain/serviceVersionChainDbConfig.js';
import type { ServiceVersionRepo } from '../ServiceVersionRepo.js';
import { serviceVersionRepoDbConfig } from '../serviceVersionRepoDbConfig.js';
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
  executedCommandOutbox: Pick<
    ServiceVersionRepo['executedCommandOutbox'],
    'drain'
  >;
  chain: Pick<ServiceVersionChain, 'getServiceResult'>;
  db: IDb;
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

  // 4 — drain the merged local order through this command's execution position
  const publication = props.db
    .select()
    .from(serviceVersionRepoDbConfig.schema.executedCommandOutbox)
    .where(
      eq(
        serviceVersionRepoDbConfig.schema.executedCommandOutbox.serviceIndex,
        props.serviceIndex,
      ),
    )
    .get();
  if (publication !== undefined) {
    yield* props.executedCommandOutbox.drain(publication.executedIndex);
  }
  const row = yield* makeAsync(() =>
    props.chain.getServiceResult(props.serviceIndex),
  ).pipe(Effect.flatMap(readRpcEnvelope));
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
        Schema.decodeUnknownEffect(Schema.toType(ServiceTerminalCommandSchema)),
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
