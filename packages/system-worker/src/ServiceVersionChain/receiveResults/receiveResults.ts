import { ServiceExecutedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
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
} from '../../serviceDispositionHash/serviceDispositionHash.js';
import { serviceVersionRepoDbConfig } from '../../ServiceVersionRepo/serviceVersionRepoDbConfig.js';
import { serviceVersionChainDbConfig } from '../serviceVersionChainDbConfig.js';

type IServiceRow = InferDecodedRow<
  typeof serviceVersionChainDbConfig.tables.commands.shape
>;
type IMutationRow =
  typeof serviceVersionRepoDbConfig.schema.mutations.$inferSelect;

const readServiceCommand = (row: IServiceRow) =>
  Schema.decodeUnknownEffect(Schema.toType(ServiceExecutedCommandSchema))({
    id: row.id,
    commandName: row.commandName,
    payload: row.payload,
    contractVersion: row.contractVersion,
    serviceName: row.serviceName,
    serviceVersion: row.serviceVersion,
    admission: row.admission,
    execution: row.execution,
    dispositionHash: row.dispositionHash,
    serviceIndex: row.serviceIndex,
  });

const retainResult = makeTx('ServiceVersionChain.retainResult')(function* (
  tx: ITx<typeof serviceVersionChainDbConfig>,
  row: typeof serviceVersionRepoDbConfig.schema.commands.$inferSelect,
  command: typeof ServiceExecutedCommandSchema.Type,
  mutations: readonly IMutationRow[],
) {
  const { commands, mutations: mutationTable } =
    serviceVersionChainDbConfig.schema;
  const existing = tx
    .select()
    .from(commands)
    .where(eq(commands.serviceIndex, row.serviceIndex))
    .get();
  if (existing !== undefined) {
    const retained = tx
      .select()
      .from(mutationTable)
      .where(eq(mutationTable.serviceIndex, row.serviceIndex))
      .orderBy(asc(mutationTable.mutationIndex))
      .all();
    const { acknowledgedAt: _, lastDeliveryFailure: __, ...commandRow } = row;
    const sameCommand = isEqual(existing, commandRow);
    if (!sameCommand || !isEqual(retained, mutations)) {
      return yield* makeZerospinError('finalized-command-conflict');
    }
    return;
  }

  const tip = tx
    .select()
    .from(commands)
    .orderBy(desc(commands.serviceIndex))
    .limit(1)
    .get();
  if (row.serviceIndex !== (tip?.serviceIndex ?? 0) + 1) {
    return yield* makeZerospinError({
      code: 'finalized-command-gap',
      message: 'Finalized history must be contiguous',
    });
  }
  const previous =
    tip === undefined
      ? genesisDispositionHash()
      : (yield* serviceVersionChainDbConfig.tables.commands
          .decodeRow(tip)
          .pipe(Effect.flatMap(readServiceCommand))).dispositionHash;
  if (
    previous === null ||
    command.dispositionHash !==
      advanceDispositionHash({
        failure:
          command.admission.status === 'failed'
            ? command.admission.failure
            : command.execution.status === 'failed'
              ? command.execution.failure
              : null,
        previousDispositionHash: previous,
        serviceIndex: row.serviceIndex,
        commandId: command.id,
        disposition:
          command.execution.status === 'succeeded' ? 'success' : 'failure',
      })
  ) {
    return yield* makeZerospinError({
      code: 'finalized-command-hash-mismatch',
      message: 'Finalized disposition hash does not extend retained history',
    });
  }

  // Transfer encoded values from the outbox without re-encoding JSON or dates.
  tx.insert(commands)
    .values({
      id: row.id,
      commandName: row.commandName,
      payload: row.payload,
      contractVersion: row.contractVersion,
      serviceName: row.serviceName,
      serviceVersion: row.serviceVersion,
      admission: row.admission,
      execution: row.execution,
      dispositionHash: row.dispositionHash,
      serviceIndex: row.serviceIndex,
      executionVersion: row.executionVersion,
    })
    .run();
  if (mutations.length > 0) {
    tx.insert(mutationTable)
      .values([...mutations])
      .run();
  }
});

/** Retain contiguous service history and validate each disposition hash. */
export const receiveResults = Effect.fn('ServiceVersionChain.receiveResults')(
  function* (props: {
    db: IDb<typeof serviceVersionChainDbConfig>;
    key: { serviceName: string; serviceVersion: string };
    rows: readonly (typeof serviceVersionRepoDbConfig.schema.commands.$inferSelect & {
      mutations: readonly IMutationRow[];
    })[];
  }) {
    for (const delivery of props.rows) {
      const { mutations, ...row } = delivery;
      const seen = new Set<number>();
      let lastMutationIndex = -1;
      for (const mutation of mutations) {
        yield* serviceVersionRepoDbConfig.tables.mutations
          .decodeRow(mutation)
          .pipe(
            mapParseError({
              code: 'finalized-mutation-invalid',
              prefix: 'Invalid applied mutation',
            }),
          );
        if (
          mutation.serviceIndex !== row.serviceIndex ||
          mutation.commandId !== row.id ||
          !Number.isSafeInteger(mutation.mutationIndex) ||
          mutation.mutationIndex < 0 ||
          mutation.id !== `${row.serviceIndex}/${mutation.mutationIndex}` ||
          seen.has(mutation.mutationIndex) ||
          mutation.mutationIndex <= lastMutationIndex
        ) {
          return yield* makeZerospinError('finalized-mutation-invalid');
        }
        seen.add(mutation.mutationIndex);
        lastMutationIndex = mutation.mutationIndex;
      }
      const decoded = yield* serviceVersionRepoDbConfig.tables.commands
        .decodeRow(row)
        .pipe(
          mapParseError({
            code: 'finalized-command-invalid',
            prefix: 'Invalid finalized occurrence',
          }),
        );
      const command = yield* readServiceCommand(decoded).pipe(
        mapParseError({
          code: 'finalized-command-invalid',
          prefix: 'Invalid finalized occurrence',
        }),
      );
      if (
        decoded.executionVersion !== props.key.serviceVersion ||
        command.dispositionHash === null ||
        command.serviceName !== props.key.serviceName
      ) {
        return yield* makeZerospinError({
          code: 'finalized-command-target-mismatch',
          message:
            'Finalized occurrence does not belong to this versioned history',
        });
      }
      if (mutations.length > 0 && command.execution.status !== 'succeeded') {
        return yield* makeZerospinError('finalized-mutation-invalid');
      }
      yield* retainResult(props.db, row, command, mutations).pipe(
        Effect.mapError(cause =>
          isZerospinError(cause) && cause.code !== 'drizzle-transaction-failed'
            ? cause
            : makeZerospinError({
                code: 'finalized-command-commit-failed',
                message: 'Failed to persist finalized occurrence',
                cause: prettyUnknownFailure(cause),
              }),
        ),
      );
    }
  },
);
