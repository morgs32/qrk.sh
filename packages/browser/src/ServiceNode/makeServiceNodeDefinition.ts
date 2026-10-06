import { hashNodeValue } from '@zerospin/core/Node/sessionKey';
import type { IServiceNodeDefinition } from '@zerospin/core/ServiceNode/types';
import { makeZerospinError } from '@zerospin/error';

import type { IServiceNodeRequest } from './serviceNodeRequest.ts';
export async function makeServiceNodeDefinition(
  request: IServiceNodeRequest,
  claims: Readonly<Record<string, unknown>>,
): Promise<IServiceNodeDefinition> {
  const { lock, ...configuration } = request;
  if (lock.sessionName !== request.sessionName) {
    throw makeZerospinError({ code: 'node-definition-session-mismatch' });
  }
  return {
    identity: {
      ...configuration,
      actorName: lock.actorName,
      actorVersion: lock.actorVersion,
      claims,
      definitionHash: await hashNodeValue(lock),
    },
    lock,
  };
}
