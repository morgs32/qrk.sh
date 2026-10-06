import type { IAggregateNodeDefinition } from '@zerospin/core/AggregateNode/types';
import { hashNodeValue } from '@zerospin/core/Node/sessionKey';
import { makeZerospinError } from '@zerospin/error';

import type { IAggregateNodeRequest } from './aggregateNodeRequest.ts';
export async function makeAggregateNodeDefinition(
  request: IAggregateNodeRequest,
  claims: Readonly<Record<string, unknown>>,
  aggregateId: string,
): Promise<IAggregateNodeDefinition> {
  const { lock, ...configuration } = request;
  if (lock.sessionName !== request.sessionName) {
    throw makeZerospinError({ code: 'node-definition-session-mismatch' });
  }
  return {
    identity: {
      ...configuration,
      aggregateId,
      actorName: lock.actorName,
      actorVersion: lock.actorVersion,
      claims,
      definitionHash: await hashNodeValue(lock),
    },
    lock,
  };
}
