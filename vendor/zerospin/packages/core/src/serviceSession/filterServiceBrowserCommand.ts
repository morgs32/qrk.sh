import { isEqual } from 'es-toolkit';

import type { ServiceCallerSchema } from '../contracts/ServiceCallerSchema.ts';

import type { IServiceBrowserCommand } from './types.ts';

/** Ownership stays private in retained metadata; public delivery contains only a browser command. */
export function filterServiceBrowserCommand(
  output: IServiceBrowserCommand,
  models: Readonly<Record<string, unknown>>,
  caller?: {
    claims: Readonly<Record<string, unknown>>;
    sessionName: string;
    nodeId?: string | null;
  },
  owner: typeof ServiceCallerSchema.Type | null = null,
): IServiceBrowserCommand {
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
    id: output.id,
    commandName: output.commandName,
    admission: owns ? output.admission : null,
    execution: owns ? output.execution : null,
    delta: {
      upserted: output.delta.upserted.filter(resource =>
        Object.hasOwn(models, resource.modelName),
      ),
      deleted: output.delta.deleted.filter(resource =>
        Object.hasOwn(models, resource.modelName),
      ),
    },
  };
}
