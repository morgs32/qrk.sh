import { hashNodeValue } from './nodeKey.ts';
import type { INodeRequest } from './nodeRequest.ts';
import type { INodeDefinition } from './types.ts';

export async function makeNodeDefinition(
  request: INodeRequest,
  claims: Readonly<Record<string, unknown>>,
  targetId: string,
): Promise<INodeDefinition> {
  const { lock, ...configuration } = request;
  return {
    identity: {
      ...configuration,
      actorName: lock.actorName,
      actorVersion: lock.actorVersion,
      targetId,
      claims,
      definitionHash: await hashNodeValue(lock),
    },
    lock,
  };
}
