import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { makeZerospinError } from '@zerospin/error';

import { createServiceSessionWebSocketTicket } from '../createServiceSessionWebSocketTicket.ts';
import { fetchServiceSessionSnapshot } from '../fetchServiceSessionSnapshot.ts';
import { runNodeNetwork } from '../Node/runNodeNetwork.ts';

import type { IServiceNodeRequest } from './serviceNodeRequest.ts';
export const serviceNodeNetwork = (
  request: IServiceNodeRequest,
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
        fetchServiceSessionSnapshot({
          ...common,
          serviceSessionLock: request.lock,
          nodeId,
        }),
      );
      if (
        snapshot.serviceName !== request.serviceName ||
        snapshot.serviceVersion !== request.serviceVersion ||
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
        createServiceSessionWebSocketTicket({
          ...common,
          serviceSessionLock: request.lock,
        }),
      ),
  };
};
