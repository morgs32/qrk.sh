import { isEqual } from 'es-toolkit';

import type { ServiceCallerSchema } from '../contracts/ServiceCallerSchema.ts';

import type { IServiceActorOutput } from './types.ts';

/** Ownership stays private in retained metadata; public delivery contains only a browser command. */
export function filterServiceActorOutput(
  output: IServiceActorOutput,
  models: Readonly<Record<string, unknown>>,
  caller?: {
    claims: Readonly<Record<string, unknown>>;
    sessionName: string;
    nodeId?: string | null;
  },
  owner: typeof ServiceCallerSchema.Type | null = null,
): IServiceActorOutput {
  const owns =
    caller !== undefined &&
    owner !== null &&
    owner.nodeId === caller.nodeId &&
    owner.sessionName === caller.sessionName &&
    isEqual(owner.claims, caller.claims);
  return {
    executedIndex: output.executedIndex,
    serviceHash: output.serviceHash,
    serviceIndex: output.serviceIndex,
    command: {
      id: output.command.id,
      commandName: output.command.commandName,
      failure: owns ? output.command.failure : null,
      delta: {
        upserted: output.command.delta.upserted.filter(resource =>
          Object.hasOwn(models, resource.modelName),
        ),
        deleted: output.command.delta.deleted.filter(resource =>
          Object.hasOwn(models, resource.modelName),
        ),
      },
    },
  };
}
