import {
  AggregateExecutedCommandSchema,
  ServiceExecutedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import {
  isZerospinError,
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
} from '@zerospin/error';
import type { InferDecodedRow } from '@zerospin/schema';
import { asc, desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import {
  advanceDispositionHash,
  genesisDispositionHash,
} from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import { aggregateVersionRepoDbConfig } from '../../AggregateVersionRepo/aggregateVersionRepoDbConfig.js';
import type { IExecutedCommandDelivery } from '../../AggregateVersionRepo/types.js';
import { aggregateVersionChainDbConfig } from '../aggregateVersionChainDbConfig.js';

type IAggregateRow = InferDecodedRow<
  typeof aggregateVersionChainDbConfig.tables.aggregateCommands.shape
>;
type IServiceRow = InferDecodedRow<
  typeof aggregateVersionChainDbConfig.tables.serviceCommands.shape
>;

type IAggregateEncodedRow =
  typeof aggregateVersionChainDbConfig.schema.aggregateCommands.$inferInsert;
type IServiceEncodedRow =
  typeof aggregateVersionChainDbConfig.schema.serviceCommands.$inferInsert;
type IMutationRow =
  typeof aggregateVersionRepoDbConfig.schema.mutations.$inferSelect;

const retainMutations = function* (
  tx: ITx<typeof aggregateVersionChainDbConfig>,
  executedIndex: number,
  mutations: readonly IMutationRow[],
  existing: boolean,
) {
  const table = aggregateVersionChainDbConfig.schema.mutations;
  if (existing) {
    const retained = tx
      .select()
      .from(table)
      .where(eq(table.executedIndex, executedIndex))
      .orderBy(asc(table.mutationIndex))
      .all();
    if (!isEqual(retained, mutations)) {
      return yield* makeZerospinError('finalized-mutation-conflict');
    }
    return;
  }
  if (mutations.length > 0) {
    tx.insert(table)
      .values([...mutations])
      .run();
  }
};

const aggregateFields = (row: IAggregateRow) => ({
  id: row.id,
  commandName: row.commandName,
  payload: row.payload,
  contractVersion: row.contractVersion,
  aggregateId: row.aggregateId,
  aggregateName: row.aggregateName,
  systemName: row.systemName,
  ...(row.aggregateVersion === null
    ? {}
    : { aggregateVersion: row.aggregateVersion }),
  nodeId: row.nodeId,
  automationName: row.automationName,
  actorName: row.actorName,
  actorVersion: row.actorVersion,
  identity: row.identity,
  sessionName: row.sessionName,
  nodeIndex: row.nodeIndex,
  admission: row.admission,
  execution: row.execution,
  dispositionHash: row.dispositionHash,
  aggregateIndex: row.aggregateIndex,
});

const serviceFields = (row: IServiceRow) => ({
  id: row.id,
  commandName: row.commandName,
  payload: row.payload,
  contractVersion: row.contractVersion,
  admission: row.admission,
  execution: row.execution,
  dispositionHash: row.dispositionHash,
  serviceName: row.serviceName,
  serviceVersion: row.serviceVersion,
  serviceIndex: row.serviceIndex,
});

const readAggregateCommand = (row: IAggregateRow) =>
  Schema.decodeUnknownEffect(Schema.toType(AggregateExecutedCommandSchema))(
    aggregateFields(row),
  );
const readServiceCommand = (row: IServiceRow) =>
  Schema.decodeUnknownEffect(Schema.toType(ServiceExecutedCommandSchema))(
    serviceFields(row),
  );

const aggregateEncodedFields = (
  row: typeof aggregateVersionRepoDbConfig.schema.aggregateCommands.$inferSelect,
): IAggregateEncodedRow => ({
  id: row.id,
  commandName: row.commandName,
  payload: row.payload,
  contractVersion: row.contractVersion,
  aggregateId: row.aggregateId,
  aggregateName: row.aggregateName,
  systemName: row.systemName,
  aggregateVersion: row.aggregateVersion,
  nodeId: row.nodeId,
  automationName: row.automationName,
  actorName: row.actorName,
  actorVersion: row.actorVersion,
  identity: row.identity,
  sessionName: row.sessionName,
  nodeIndex: row.nodeIndex,
  admission: row.admission,
  execution: row.execution,
  dispositionHash: row.dispositionHash,
  executedIndex: row.executedIndex,
  aggregateIndex: row.aggregateIndex,
  executionVersion: row.executionVersion,
});
const serviceEncodedFields = (
  row: typeof aggregateVersionRepoDbConfig.schema.serviceCommands.$inferSelect,
): IServiceEncodedRow => ({
  id: row.id,
  commandName: row.commandName,
  payload: row.payload,
  contractVersion: row.contractVersion,
  admission: row.admission,
  execution: row.execution,
  dispositionHash: row.dispositionHash,
  executedIndex: row.executedIndex,
  serviceName: row.serviceName,
  serviceVersion: row.serviceVersion,
  serviceIndex: row.serviceIndex,
  executionVersion: row.executionVersion,
});

const retainAggregateCommand = makeTx(
  'AggregateVersionChain.retainAggregateCommand',
)(function* (
  tx: ITx<typeof aggregateVersionChainDbConfig>,
  row: typeof aggregateVersionRepoDbConfig.schema.aggregateCommands.$inferSelect,
  decoded: InferDecodedRow<
    typeof aggregateVersionRepoDbConfig.tables.aggregateCommands.shape
  >,
  command: typeof AggregateExecutedCommandSchema.Type,
  mutations: readonly IMutationRow[],
) {
  const { aggregateCommands, serviceCommands } =
    aggregateVersionChainDbConfig.schema;
  const existingAggregate = tx
    .select()
    .from(aggregateCommands)
    .where(eq(aggregateCommands.executedIndex, row.executedIndex))
    .get();
  const existingService = tx
    .select()
    .from(serviceCommands)
    .where(eq(serviceCommands.executedIndex, row.executedIndex))
    .get();
  if (existingAggregate !== undefined || existingService !== undefined) {
    const identical =
      existingAggregate !== undefined &&
      existingService === undefined &&
      isEqual(
        yield* aggregateVersionChainDbConfig.tables.aggregateCommands.decodeRow(
          existingAggregate,
        ),
        decodedAggregateFields(decoded),
      );
    if (!identical) {
      return yield* makeZerospinError('finalized-command-conflict');
    }
    yield* retainMutations(tx, row.executedIndex, mutations, true);
    return;
  }
  const aggregateTip = tx
    .select()
    .from(aggregateCommands)
    .orderBy(desc(aggregateCommands.executedIndex))
    .limit(1)
    .get();
  const serviceTip = tx
    .select({ index: serviceCommands.executedIndex })
    .from(serviceCommands)
    .orderBy(desc(serviceCommands.executedIndex))
    .limit(1)
    .get();
  if (
    row.executedIndex !==
    Math.max(aggregateTip?.executedIndex ?? 0, serviceTip?.index ?? 0) + 1
  ) {
    return yield* makeZerospinError({
      code: 'finalized-command-gap',
      message: 'Finalized history must be contiguous',
    });
  }
  const previous =
    aggregateTip === undefined
      ? genesisDispositionHash()
      : (yield* aggregateVersionChainDbConfig.tables.aggregateCommands
          .decodeRow(aggregateTip)
          .pipe(Effect.flatMap(readAggregateCommand))).dispositionHash;
  if (
    command.aggregateIndex !== (aggregateTip?.aggregateIndex ?? 0) + 1 ||
    command.dispositionHash !==
      advanceDispositionHash({
        failure:
          command.admission.status === 'failed'
            ? command.admission.failure
            : command.execution.status === 'failed'
              ? command.execution.failure
              : null,
        previousDispositionHash: previous,
        aggregateIndex: command.aggregateIndex,
        commandId: command.id,
        disposition:
          command.execution.status === 'succeeded' ? 'success' : 'failure',
      })
  ) {
    return yield* makeZerospinError('finalized-command-hash-mismatch');
  }
  tx.insert(aggregateCommands).values(aggregateEncodedFields(row)).run();
  yield* retainMutations(tx, row.executedIndex, mutations, false);
});

const retainServiceCommand = makeTx(
  'AggregateVersionChain.retainServiceCommand',
)(function* (
  tx: ITx<typeof aggregateVersionChainDbConfig>,
  row: typeof aggregateVersionRepoDbConfig.schema.serviceCommands.$inferSelect,
  decoded: InferDecodedRow<
    typeof aggregateVersionRepoDbConfig.tables.serviceCommands.shape
  >,
  mutations: readonly IMutationRow[],
) {
  const { aggregateCommands, serviceCommands } =
    aggregateVersionChainDbConfig.schema;
  const existingAggregate = tx
    .select()
    .from(aggregateCommands)
    .where(eq(aggregateCommands.executedIndex, row.executedIndex))
    .get();
  const existingService = tx
    .select()
    .from(serviceCommands)
    .where(eq(serviceCommands.executedIndex, row.executedIndex))
    .get();
  if (existingAggregate !== undefined || existingService !== undefined) {
    const identical =
      existingAggregate === undefined &&
      existingService !== undefined &&
      isEqual(
        yield* aggregateVersionChainDbConfig.tables.serviceCommands.decodeRow(
          existingService,
        ),
        decodedServiceFields(decoded),
      );
    if (!identical) {
      return yield* makeZerospinError('finalized-command-conflict');
    }
    yield* retainMutations(tx, row.executedIndex, mutations, true);
    return;
  }
  const aggregateTip = tx
    .select({ index: aggregateCommands.executedIndex })
    .from(aggregateCommands)
    .orderBy(desc(aggregateCommands.executedIndex))
    .limit(1)
    .get();
  const serviceTip = tx
    .select({ index: serviceCommands.executedIndex })
    .from(serviceCommands)
    .orderBy(desc(serviceCommands.executedIndex))
    .limit(1)
    .get();
  if (
    row.executedIndex !==
    Math.max(aggregateTip?.index ?? 0, serviceTip?.index ?? 0) + 1
  ) {
    return yield* makeZerospinError({
      code: 'finalized-command-gap',
      message: 'Finalized history must be contiguous',
    });
  }
  tx.insert(serviceCommands).values(serviceEncodedFields(row)).run();
  yield* retainMutations(tx, row.executedIndex, mutations, false);
});

// Full-row comparison excludes only the repo's delivery metadata.
const decodedAggregateFields = (
  row: InferDecodedRow<
    typeof aggregateVersionRepoDbConfig.tables.aggregateCommands.shape
  >,
): IAggregateRow => {
  const { acknowledgedAt: _, lastDeliveryFailure: __, ...shared } = row;
  return shared;
};
const decodedServiceFields = (
  row: InferDecodedRow<
    typeof aggregateVersionRepoDbConfig.tables.serviceCommands.shape
  >,
): IServiceRow => {
  const { acknowledgedAt: _, lastDeliveryFailure: __, ...shared } = row;
  return shared;
};

/** Retain contiguous executed history before acknowledgement; identical retries do not append. */
export const receiveExecutedCommands = Effect.fn(
  'AggregateVersionChain.receiveExecutedCommands',
)(function* (props: {
  db: IDb<typeof aggregateVersionChainDbConfig>;
  key: { aggregateId: string; aggregateName: string; aggregateVersion: string };
  rows: readonly IExecutedCommandDelivery[];
}) {
  for (const delivery of props.rows) {
    const { mutations, ...row } = delivery;
    const seen = new Set<number>();
    let lastMutationIndex = -1;
    for (const mutation of mutations) {
      yield* aggregateVersionRepoDbConfig.tables.mutations
        .decodeRow(mutation)
        .pipe(
          mapParseError({
            code: 'finalized-mutation-invalid',
            prefix: 'Invalid applied mutation',
          }),
        );
      if (
        mutation.executedIndex !== row.executedIndex ||
        mutation.commandId !== row.id ||
        !Number.isSafeInteger(mutation.mutationIndex) ||
        mutation.mutationIndex < 0 ||
        mutation.id !== `${row.executedIndex}/${mutation.mutationIndex}` ||
        seen.has(mutation.mutationIndex) ||
        mutation.mutationIndex <= lastMutationIndex
      ) {
        return yield* makeZerospinError('finalized-mutation-invalid');
      }
      seen.add(mutation.mutationIndex);
      lastMutationIndex = mutation.mutationIndex;
    }
    if ('serviceName' in row) {
      const decoded = yield* aggregateVersionRepoDbConfig.tables.serviceCommands
        .decodeRow(row)
        .pipe(
          mapParseError({
            code: 'executed-command-invalid',
            prefix: 'Invalid service row',
          }),
        );
      yield* readServiceCommand(decoded).pipe(
        mapParseError({
          code: 'executed-command-invalid',
          prefix: 'Invalid service output',
        }),
      );
      if (
        !Number.isSafeInteger(row.executedIndex) ||
        row.executedIndex < 1 ||
        row.executionVersion !== props.key.aggregateVersion
      ) {
        return yield* makeZerospinError('finalized-command-target-mismatch');
      }
      if (mutations.length > 0 && decoded.execution.status !== 'succeeded') {
        return yield* makeZerospinError('finalized-mutation-invalid');
      }
      yield* retainServiceCommand(props.db, row, decoded, mutations).pipe(
        Effect.mapError(cause =>
          isZerospinError(cause) && cause.code !== 'drizzle-transaction-failed'
            ? cause
            : makeZerospinError({
                code: 'finalized-command-publication-failed',
                message: 'Failed to retain executed command',
                cause: prettyUnknownFailure(cause),
              }),
        ),
      );
    } else {
      const decoded =
        yield* aggregateVersionRepoDbConfig.tables.aggregateCommands
          .decodeRow(row)
          .pipe(
            mapParseError({
              code: 'executed-command-invalid',
              prefix: 'Invalid aggregate row',
            }),
          );
      const command = yield* readAggregateCommand(decoded).pipe(
        mapParseError({
          code: 'executed-command-invalid',
          prefix: 'Invalid aggregate output',
        }),
      );
      if (
        !Number.isSafeInteger(row.executedIndex) ||
        row.executedIndex < 1 ||
        row.executionVersion !== props.key.aggregateVersion ||
        command.aggregateId !== props.key.aggregateId ||
        command.aggregateName !== props.key.aggregateName
      ) {
        return yield* makeZerospinError('finalized-command-target-mismatch');
      }
      if (mutations.length > 0 && decoded.execution.status !== 'succeeded') {
        return yield* makeZerospinError('finalized-mutation-invalid');
      }
      yield* retainAggregateCommand(
        props.db,
        row,
        decoded,
        command,
        mutations,
      ).pipe(
        Effect.mapError(cause =>
          isZerospinError(cause) && cause.code !== 'drizzle-transaction-failed'
            ? cause
            : makeZerospinError({
                code: 'finalized-command-publication-failed',
                message: 'Failed to retain executed command',
                cause: prettyUnknownFailure(cause),
              }),
        ),
      );
    }
  }
});
