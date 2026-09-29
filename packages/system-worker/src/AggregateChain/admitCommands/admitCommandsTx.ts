import { type AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { aggregateChainDbConfig } from '../aggregateChainDbConfig.js';

/** Commit complete, validated occurrences together; a repeated id returns the stored command. */
const retain = makeTx('AggregateChain.admitCommandsTx')(function* (
  tx: ITx<typeof aggregateChainDbConfig>,
  preparedCommands: readonly {
    command: IEncodedCommand<IAggregateCommand>;
    admission: typeof AdmissionResultSchema.Type;
  }[],
) {
  const { commands } = aggregateChainDbConfig.schema;
  const admitted: (IEncodedCommand<IAggregateCommand> & {
    aggregateIndex: number;
    admission: typeof AdmissionResultSchema.Type;
  })[] = [];

  // Read the latest aggregateIndex inside the insertion transaction.
  let index =
    tx
      .select({ index: commands.aggregateIndex })
      .from(commands)
      .orderBy(desc(commands.aggregateIndex))
      .limit(1)
      .get()?.index ?? 0;

  for (const { command, admission } of preparedCommands) {
    // A repeated id returns the command already stored, including one inserted
    // earlier in this batch.
    const retained = tx
      .select()
      .from(commands)
      .where(eq(commands.id, command.id))
      .get();
    if (retained !== undefined) {
      if (
        retained.nodeId !== command.nodeId ||
        retained.sessionName !== command.sessionName ||
        retained.actorName !== command.actorName ||
        retained.actorVersion !== command.actorVersion ||
        !isEqual(JSON.parse(retained.claims), command.claims)
      ) {
        return yield* makeZerospinError({
          code: 'node-admission-identity-mismatch',
        });
      }
      const decoded =
        yield* aggregateChainDbConfig.tables.commands.decodeRow(retained);
      const original = yield* Schema.decodeUnknownEffect(
        EncodedAggregateCommandSchema,
      )(decoded);
      admitted.push({
        ...original,
        aggregateIndex: decoded.aggregateIndex,
        admission: decoded.admission,
      });
      continue;
    }

    if (command.nodeId !== null) {
      const prior = tx
        .select()
        .from(commands)
        .where(eq(commands.nodeId, command.nodeId))
        .orderBy(desc(commands.nodeIndex))
        .limit(1)
        .get();
      const expectedNodeIndex = (prior?.nodeIndex ?? 0) + 1;
      if (command.nodeIndex !== expectedNodeIndex) {
        return yield* makeZerospinError({
          code: 'node-admission-index-mismatch',
          message: 'Command is not the next retained node position',
          extra: { expectedNodeIndex, nodeIndex: command.nodeIndex },
        });
      }
      if (
        prior !== undefined &&
        (prior.sessionName !== command.sessionName ||
          prior.actorName !== command.actorName ||
          prior.actorVersion !== command.actorVersion ||
          !isEqual(JSON.parse(prior.claims), command.claims))
      ) {
        return yield* makeZerospinError({
          code: 'node-admission-identity-mismatch',
        });
      }
    }

    index += 1;
    // Store the command fields once as an aggregate occurrence.
    tx.insert(commands)
      .values({
        ...(yield* aggregateChainDbConfig.tables.commands.encodeRow({
          ...command,
          aggregateVersion:
            'aggregateVersion' in command ? command.aggregateVersion : null,
          aggregateIndex: index,
          admission,
        })),
      })
      .run();
    admitted.push({ ...command, aggregateIndex: index, admission });
  }
  return admitted;
});

export const admitCommandsTx = Effect.fn('AggregateChain.admitCommandsTx')(
  function* (
    db: Parameters<typeof retain>[0],
    commands: Parameters<typeof retain>[1],
  ) {
    if (commands.length === 0) return [];
    return yield* retain(db, commands).pipe(
      Effect.mapError(error =>
        !('code' in error) || error.code === 'drizzle-transaction-failed'
          ? makeZerospinError({
              code: 'aggregate-admission-failed',
              message: 'Failed to retain command',
              cause: prettyUnknownFailure(error),
            })
          : error,
      ),
    );
  },
);
