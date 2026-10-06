import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { makeZerospinError } from '@zerospin/error';

import { createAggregateSessionWebSocketTicket } from '../createAggregateSessionWebSocketTicket.ts';
import { fetchAggregateSessionSnapshot } from '../fetchAggregateSessionSnapshot.ts';
import { runNodeNetwork } from '../Node/runNodeNetwork.ts';

import type { IAggregateNodeRequest } from './aggregateNodeRequest.ts';
export const aggregateNodeNetwork = (
  request: IAggregateNodeRequest,
  admission: IAdmissionRequest,
) => {
  const common = {
    ...request,
    getAdmission: async () => ({
      _tag: 'Success' as const,
      success: admission,
    }),
  };
  return {
    snapshot: async (nodeId: string | null) => {
      const snapshot = await runNodeNetwork(
        fetchAggregateSessionSnapshot({
          ...common,
          aggregateSessionLock: request.lock,
          nodeId,
        }),
      );
      if (
        snapshot.aggregateName !== request.aggregateName ||
        snapshot.aggregateVersion !== request.aggregateVersion ||
        snapshot.actorName !== request.lock.actorName ||
        snapshot.actorVersion !== request.lock.actorVersion ||
        snapshot.sessionName !== request.sessionName
      ) {
        throw makeZerospinError({
          code: 'node-authentication-identity-mismatch',
        });
      }
      return snapshot;
    },
    ticket: () =>
      runNodeNetwork(
        createAggregateSessionWebSocketTicket({
          ...common,
          aggregateSessionLock: request.lock,
        }),
      ),
  };
};
