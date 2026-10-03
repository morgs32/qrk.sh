import { AsyncCommandInputSchema } from '@zerospin/core/contracts/AsyncCommandInputSchema';
import { decodeAsyncInput } from '@zerospin/core/contracts/asyncInputCodec';
import {
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type { IContract } from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { aggregateVersionRepoDbConfig } from '../AggregateVersionRepo/aggregateVersionRepoDbConfig.js';

import {
  asyncOperationLifecycleCodec,
  asyncOperationsDbConfig,
} from './asyncOperationsDbConfig.js';
import type { IAsyncOperations } from './makeAsyncOperations.js';

export const resolveWorkContract = Effect.fn('resolveWorkContract')(function* (
  owner: {
    actors: Readonly<
      Record<
        string,
        { version: string; contracts: Readonly<Record<string, IContract>> }
      >
    >;
  },
  work: IAsyncOperations,
) {
  const actor = owner.actors[work.actorName ?? ''];
  const contract = actor?.contracts[work.asyncContractName];
  if (
    actor?.version !== work.actorVersion ||
    contract?.version !== work.asyncContractVersion ||
    contract.async === undefined
  ) {
    return yield* makeZerospinError('async-operation-definition-unavailable');
  }
  return contract;
});
export const readPreparedAsyncWork = Effect.fn('readPreparedAsyncWork')(
  function* (db: IDb, commandId: string) {
    const id = yield* Schema.decodeUnknownEffect(
      makeAbbreviationIdSchema('cmd'),
    )(commandId).pipe(
      mapParseError({
        code: 'async-command-id-invalid',
        prefix: 'Invalid child id',
      }),
    );
    const row = db
      .select()
      .from(asyncOperationsDbConfig.schema.asyncOperations)
      .where(
        eq(asyncOperationsDbConfig.schema.asyncOperations.asyncCommandId, id),
      )
      .get();
    if (row === undefined) {
      return yield* makeZerospinError('async-operation-missing');
    }
    const work = yield* Schema.decodeUnknownEffect(
      asyncOperationLifecycleCodec,
    )(row).pipe(
      mapParseError({
        code: 'async-operation-row-invalid',
        prefix: 'Invalid work row',
      }),
    );
    if (work.externalRecordedAt === null) {
      return yield* makeZerospinError('async-operation-not-recorded');
    }
    return work;
  },
);
export const readPreparedAggregateAsyncWork = Effect.fn(
  'readPreparedAggregateAsyncWork',
)(function* (db: IDb, commandId: string) {
  const id = yield* Schema.decodeUnknownEffect(makeAbbreviationIdSchema('cmd'))(
    commandId,
  ).pipe(
    mapParseError({
      code: 'async-command-id-invalid',
      prefix: 'Invalid child id',
    }),
  );
  const row = db
    .select()
    .from(aggregateVersionRepoDbConfig.schema.asyncOperations)
    .where(
      eq(
        aggregateVersionRepoDbConfig.schema.asyncOperations.asyncCommandId,
        id,
      ),
    )
    .get();
  if (row === undefined) {
    return yield* makeZerospinError('async-operation-missing');
  }
  const work = yield* aggregateVersionRepoDbConfig.tables.asyncOperations
    .decodeRow(row)
    .pipe(
      Effect.tap(
        Schema.decodeUnknownEffect(Schema.toType(asyncOperationLifecycleCodec)),
      ),
      mapParseError({
        code: 'async-operation-row-invalid',
        prefix: 'Invalid retained aggregate async operation',
      }),
    );
  if (work.externalRecordedAt === null || work.systemName === null) {
    return yield* makeZerospinError('async-operation-not-recorded');
  }
  return work;
});
const privateInput = (work: IAsyncOperations) => ({
  sourceCommandId: work.commandId,
  external: work.external,
});
export const makePreparedAggregateCommand = Effect.fn(
  'makePreparedAggregateCommand',
)(function* (
  work: IAsyncOperations & { systemName: string | null },
  contract: IContract,
  key: { aggregateId: string; aggregateName: string; aggregateVersion: string },
) {
  const asyncInput = yield* Schema.decodeUnknownEffect(AsyncCommandInputSchema)(
    privateInput(work),
  ).pipe(
    mapParseError({
      code: 'async-input-invalid',
      prefix: 'Invalid recorded input',
    }),
  );
  yield* decodeAsyncInput(contract, work.payload, asyncInput);
  const command = yield* Schema.decodeUnknownEffect(
    EncodedAggregateCommandSchema,
  )({
    id: work.asyncCommandId,
    commandName: work.asyncContractName,
    contractVersion: work.asyncContractVersion,
    payload: JSON.stringify(work.payload),
    asyncInput,
    ...key,
    systemName: work.systemName,
    actorName: work.actorName,
    actorVersion: work.actorVersion,
    claims: work.claims,
    nodeId: null,
    nodeIndex: null,
    sessionName: null,
  }).pipe(
    mapParseError({
      code: 'async-command-invalid',
      prefix: 'Invalid prepared command',
    }),
  );
  return { ...command, asyncInput, ownerKind: 'aggregate' as const };
});
export const makePreparedServiceCommand = Effect.fn(
  'makePreparedServiceCommand',
)(function* (
  work: IAsyncOperations,
  contract: IContract,
  key: { serviceName: string; serviceVersion: string },
) {
  const asyncInput = yield* Schema.decodeUnknownEffect(AsyncCommandInputSchema)(
    privateInput(work),
  ).pipe(
    mapParseError({
      code: 'async-input-invalid',
      prefix: 'Invalid recorded input',
    }),
  );
  yield* decodeAsyncInput(contract, work.payload, asyncInput);
  const command = yield* Schema.decodeUnknownEffect(
    EncodedServiceCommandSchema,
  )({
    id: work.asyncCommandId,
    commandName: work.asyncContractName,
    contractVersion: work.asyncContractVersion,
    payload: JSON.stringify(work.payload),
    asyncInput,
    ...key,
    caller: {
      actorName: work.actorName,
      actorVersion: work.actorVersion,
      claims: work.claims,
      nodeId: null,
      nodeIndex: null,
      sessionName: null,
    },
  }).pipe(
    mapParseError({
      code: 'async-command-invalid',
      prefix: 'Invalid prepared command',
    }),
  );
  return { ...command, asyncInput, ownerKind: 'service' as const };
});
