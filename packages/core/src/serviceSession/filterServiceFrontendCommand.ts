import type { IEncodedCommand } from '../contracts/types.ts';

import type { IServiceFrontendFinalizedCommand } from './types.ts';

/** Keep each complete occurrence and its cursor, even when its selected delta is empty. */
export function filterServiceFrontendCommand<
  COMMAND extends
    | IEncodedCommand<IServiceFrontendFinalizedCommand>
    | IServiceFrontendFinalizedCommand,
>(command: COMMAND, models: Readonly<Record<string, unknown>>): COMMAND {
  if (command.delta === null) return command;
  return {
    ...command,
    delta: {
      inserted: command.delta.inserted.filter(resource =>
        Object.hasOwn(models, resource.modelName),
      ),
      updated: command.delta.updated.filter(resource =>
        Object.hasOwn(models, resource.modelName),
      ),
      deleted: command.delta.deleted.filter(resource =>
        Object.hasOwn(models, resource.modelName),
      ),
      mutations: command.delta.mutations.filter(mutation =>
        Object.hasOwn(models, mutation.modelName),
      ),
    },
  };
}
