import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { decodeRpcOutcome } from '@zerospin/core/utils/decodeRpcOutcome';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import type { IAnyError, IResult, IZerospinErrorJson } from '@zerospin/error';
import {
  annotateFunctionSpan,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

export const createAggregateSessionWebSocketTicket = Effect.fn(
  'createAggregateSessionWebSocketTicket',
)(function* (props: {
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  getAdmission(): Promise<
    IResult<IAdmissionRequest, IAnyError | IZerospinErrorJson>
  >;
  aggregateName: string;
  aggregateVersion: string;
  sessionName: string;
  aggregateSessionLock: IAggregateSessionLock;
}): Effect.fn.Return<
  Readonly<{ ticket: string }>,
  IAnyError | IZerospinErrorJson,
  Async | TelemetryCollector
> {
  const {
    aggregateSessionLock,
    aggregateName,
    apiUrl,
    sessionName,
    getAdmission,
    publishableKey,
    systemName,
    aggregateVersion,
  } = props;
  const request = yield* makeAsync(getAdmission).pipe(
    Effect.flatMap(envelope => decodeRpcOutcome(envelope)),
  );
  const sessionApi = yield* getApi<GatewayApi>(apiUrl)(gatewayApi =>
    gatewayApi
      .aggregate({
        publishableKey,
        systemName,
        name: aggregateName,
        version: aggregateVersion,
        actorName: aggregateSessionLock.actorName,
        actorVersion: aggregateSessionLock.actorVersion,
      })
      .admit(request)
      .authorize({
        sessionName,
        aggregateSessionLock,
      }),
  );
  return yield* sessionApi.createWebSocketTicket({
    aggregateVersion,
  });
}, annotateFunctionSpan);
