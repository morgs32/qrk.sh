import type { IServiceSelectedCommand } from './types.ts';

/** Keep each complete occurrence and its cursor, even when its selected delta is empty. */
export function filterServiceSelectedCommand<COMMAND extends IServiceSelectedCommand>(
  command: COMMAND,
  models: Readonly<Record<string, unknown>>,
): COMMAND {
  return {
    ...command,
    delta: {
      upserted: command.delta.upserted.filter(resource =>
        Object.hasOwn(models, resource.modelName),
      ),
      deleted: command.delta.deleted.filter(resource =>
        Object.hasOwn(models, resource.modelName),
      ),
    },
  };
}
