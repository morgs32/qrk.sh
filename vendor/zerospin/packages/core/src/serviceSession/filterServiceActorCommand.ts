import type { IServiceActorCommand } from './types.ts';

/** Keep each complete occurrence and its cursor, even when its selected delta is empty. */
export function filterServiceActorCommand(
  command: IServiceActorCommand,
  models: Readonly<Record<string, unknown>>,
): IServiceActorCommand {
  return {
    id: command.id,
    serviceIndex: command.serviceIndex,
    serviceHash: command.serviceHash,
    actorDelta: {
      upserted: command.actorDelta.upserted.filter(resource =>
        Object.hasOwn(models, resource.modelName),
      ),
      deleted: command.actorDelta.deleted.filter(resource =>
        Object.hasOwn(models, resource.modelName),
      ),
    },
  };
}
