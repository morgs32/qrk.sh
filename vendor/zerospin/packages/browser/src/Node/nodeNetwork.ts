import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import {
  makeZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect } from 'effect';

import { createAggregateSessionWebSocketTicket } from '../createAggregateSessionWebSocketTicket.ts';
import { createServiceSessionWebSocketTicket } from '../createServiceSessionWebSocketTicket.ts';
import { fetchAggregateSessionSnapshot } from '../fetchAggregateSessionSnapshot.ts';
import { fetchServiceSessionSnapshot } from '../fetchServiceSessionSnapshot.ts';

import type { INodeRequest } from './nodeRequest.ts';

export const nodeNetwork = (
  request: INodeRequest,
  admission: IAdmissionRequest,
) => {
  const common = {
    ...request,
    getAdmission: async () => ({
      _tag: 'Success' as const,
      success: admission,
    }),
  };
  const run = <A, E extends IAnyError | IZerospinErrorJson>(
    program: Effect.Effect<A, E, Async | TelemetryCollector>,
  ) =>
    Effect.runPromise(
      program.pipe(
        Effect.provide(AsyncLive),
        Effect.provide(makeTelemetryLayer(makeTelemetryCollector())),
        Effect.timeout('10 seconds'),
        Effect.catchTag('TimeoutError', () =>
          Effect.fail(makeZerospinError({ code: 'node-network-unavailable' })),
        ),
        encodeRpcOutcome,
      ),
    ).then(result => {
      if (result._tag === 'Failure') throw makeZerospinError(result.failure);
      return result.success;
    });
  return {
    snapshot: (nodeId: string | null) =>
      request.kind === 'aggregate'
        ? run(
            fetchAggregateSessionSnapshot({
              ...common,
              aggregateName: request.targetName,
              aggregateVersion: request.targetVersion,
              aggregateSessionLock: request.lock,
              nodeId,
            }),
          )
        : run(
            fetchServiceSessionSnapshot({
              ...common,
              serviceName: request.targetName,
              serviceVersion: request.targetVersion,
              serviceSessionLock: request.lock,
            }),
          ),
    ticket: () =>
      request.kind === 'aggregate'
        ? run(
            createAggregateSessionWebSocketTicket({
              ...common,
              aggregateName: request.targetName,
              aggregateVersion: request.targetVersion,
              aggregateSessionLock: request.lock,
            }),
          )
        : run(
            createServiceSessionWebSocketTicket({
              ...common,
              serviceName: request.targetName,
              serviceVersion: request.targetVersion,
              serviceSessionLock: request.lock,
            }),
          ),
  };
};
