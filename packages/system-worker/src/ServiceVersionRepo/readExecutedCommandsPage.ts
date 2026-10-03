import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { and, asc, eq, lte } from 'drizzle-orm';
import { isEqual } from 'es-toolkit';

import { readServiceVersionRepoOutput } from '../asyncOperations/readOperationOutput.js';
import { forwardCommand } from '../forwardedCommands.js';

import { serviceVersionRepoDbConfig } from './serviceVersionRepoDbConfig.js';
type ICommand = typeof serviceVersionRepoDbConfig.schema.commands.$inferSelect;
type IOperation = ReturnType<typeof readServiceVersionRepoOutput>[number];
export type IExecutedCommandDelivery = Readonly<{
  kind: 'command';
  command: ICommand;
  operations: readonly IOperation[];
}>;
/** Deliver the queued canonical command with its locally associated replay material. */
export const readExecutedCommandsPage = (
  db: IDb,
  throughIndex?: number,
): readonly {
  index: number;
  row: IExecutedCommandDelivery;
}[] => {
  const { commands, executedCommandOutbox } = serviceVersionRepoDbConfig.schema;
  return db
    .select()
    .from(executedCommandOutbox)
    .where(
      and(
        throughIndex === undefined
          ? undefined
          : lte(executedCommandOutbox.executedIndex, throughIndex),
      ),
    )
    .orderBy(asc(executedCommandOutbox.executedIndex))
    .limit(64)
    .all()
    .map(pending => {
      const queued = forwardCommand(pending);

      const command = db
        .select()
        .from(commands)
        .where(eq(commands.serviceIndex, pending.serviceIndex))
        .get();
      if (
        command === undefined ||
        command.executedIndex !== pending.executedIndex
      ) {
        throw makeZerospinError('executed-command-missing');
      }
      if (
        queued.ownerKind !== 'service' ||
        !isEqual(queued, forwardCommand(command))
      ) {
        throw makeZerospinError('executed-command-owner-invalid');
      }
      return {
        index: pending.executedIndex,
        row: {
          kind: 'command' as const,
          command,
          operations: readServiceVersionRepoOutput(db, command.id),
        },
      };
    });
};
